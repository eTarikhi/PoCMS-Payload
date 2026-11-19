import { GraphQL } from '@payloadcms/graphql/types'
import type { ExecutionArgs, FieldNode, SelectionSetNode, ValidationRule } from 'graphql'

/** Maximum documents a GraphQL list/join field may return in one response. */
export const MAX_GRAPHQL_LIST_LIMIT = 100

const listLimitError = (message: string, node: FieldNode): GraphQL.GraphQLError =>
  new GraphQL.GraphQLError(message, { nodes: [node] })

/**
 * Resolve the selected operation's field and fragment nodes without following fragment cycles.
 * GraphQL's normal validation still reports cycles; this set only scopes the resource rule to the
 * operation that graphql-http will execute.
 */
function selectedFieldNodes(args: ExecutionArgs): Set<FieldNode> {
  const fields = new Set<FieldNode>()
  const operation = GraphQL.getOperationAST(args.document, args.operationName)
  if (!operation) return fields

  const fragments = new Map(
    args.document.definitions
      .filter((definition) => definition.kind === GraphQL.Kind.FRAGMENT_DEFINITION)
      .map((fragment) => [fragment.name.value, fragment]),
  )
  const visitedFragments = new Set<string>()
  const pending: SelectionSetNode[] = [operation.selectionSet]

  while (pending.length > 0) {
    const selectionSet = pending.pop()
    if (!selectionSet) continue

    GraphQL.visit(selectionSet, {
      Field(node) {
        fields.add(node)
      },
      FragmentSpread(node) {
        const name = node.name.value
        const fragment = fragments.get(name)
        if (fragment && !visitedFragments.has(name)) {
          visitedFragments.add(name)
          pending.push(fragment.selectionSet)
        }
      },
    })
  }

  return fields
}

function valueForArgument(
  node: FieldNode,
  name: string,
  variables: Record<string, unknown>,
): unknown {
  const value = node.arguments?.find((argument) => argument.name.value === name)?.value
  if (!value) return undefined

  if (value.kind === GraphQL.Kind.VARIABLE) return variables[value.name.value]
  if (value.kind === GraphQL.Kind.INT) return Number.parseInt(value.value, 10)
  if (value.kind === GraphQL.Kind.BOOLEAN) return value.value
  if (value.kind === GraphQL.Kind.NULL) return null

  return undefined
}

/**
 * Reject GraphQL list arguments that could disable database limiting or return more than the
 * application's server-side page maximum. Local API calls are intentionally outside this rule.
 */
export function createGraphQLListLimitRule(args: ExecutionArgs): ValidationRule {
  const selectedFields = selectedFieldNodes(args)
  const operation = GraphQL.getOperationAST(args.document, args.operationName)
  let variables: Record<string, unknown> = {}

  if (operation) {
    try {
      const result = GraphQL.getVariableValues(
        args.schema,
        operation.variableDefinitions ?? [],
        args.variableValues ?? {},
      )
      if ('coerced' in result) variables = result.coerced ?? {}
    } catch {
      // Let GraphQL.js return its standard error for malformed or incompatible variables.
    }
  }

  return (context) => ({
    Field(node) {
      if (!selectedFields.has(node)) return

      const field = context.getFieldDef()
      if (!field?.args.some((argument) => argument.name === 'limit')) return

      const limit = valueForArgument(node, 'limit', variables)
      const pagination = valueForArgument(node, 'pagination', variables)
      const count = valueForArgument(node, 'count', variables)
      const isJoin = (field.extensions?.field as { type?: unknown } | undefined)?.type === 'join'

      if (typeof limit === 'number') {
        if (!Number.isInteger(limit) || limit < 0 || limit > MAX_GRAPHQL_LIST_LIMIT) {
          context.reportError(
            listLimitError(
              `GraphQL list limits must be between 1 and ${MAX_GRAPHQL_LIST_LIMIT}.`,
              node,
            ),
          )
          return
        }

        // Payload's join resolver has a deliberate count-only path for limit: 0. All other zero
        // limits disable the SQL LIMIT clause and are therefore rejected at the GraphQL boundary.
        if (limit === 0 && !(isJoin && count === true)) {
          context.reportError(
            listLimitError(
              'GraphQL limit: 0 is not allowed because it disables database pagination.',
              node,
            ),
          )
          return
        }
      }

      // Payload treats pagination:false with an omitted/null/zero limit as an unbounded find.
      // A positive explicit limit is still honored by the database adapter when pagination is off.
      if (pagination === false && (typeof limit !== 'number' || limit === 0)) {
        context.reportError(
          listLimitError(
            `GraphQL pagination: false requires an explicit limit from 1 to ${MAX_GRAPHQL_LIST_LIMIT}.`,
            node,
          ),
        )
      }
    },
  })
}
