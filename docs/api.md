# API reference

## REST API

Use the REST endpoints to access content from the CMS.

```bash
# Get all projects
curl http://localhost:3000/api/projects

# Get a single project
curl http://localhost:3000/api/projects/:id

# List media records
curl http://localhost:3000/api/media
```

Authenticated requests can include a bearer token or session cookie depending on your Payload setup.

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/...
```

## GraphQL API

The GraphQL endpoint is available at:

```text
http://localhost:3000/graphql
```

When enabled in your Payload configuration, this provides a schema-driven way to query content and media.

## Admin API and content operations

Payload configuration can expose custom endpoints and collection-level actions. These are generally implemented in:

- `src/endpoints/`
- collection hooks and access control
- custom server routes

## Related documentation

- [Payload CMS docs](https://payloadcms.com/docs)
- [Collections docs](https://payloadcms.com/docs/configuration/collections)
- [Authentication guide](https://payloadcms.com/docs/authentication/overview)
- [Upload field docs](https://payloadcms.com/docs/configuration/collections/fields/upload)
