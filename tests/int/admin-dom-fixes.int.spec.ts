// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  makeFolderCreateButtonFocusable,
  nameFolderControls,
  nameFolderThumbnails,
} from '@/components/admin/providers/AdminDomFixes/folders'
import { ensureLandmarks, MAIN_ID, SKIP_LINK_ID } from '@/components/admin/providers/AdminDomFixes/landmarks'
import { nameIconOnlyControls } from '@/components/admin/providers/AdminDomFixes/names'
import { skipHiddenSelectControls } from '@/components/admin/providers/AdminDomFixes/reactSelect'
import {
  nameSelectionCheckboxes,
  SELECTION_LABELS,
} from '@/components/admin/providers/AdminDomFixes/selection'
import { presentTabRows, trustVisibleTabText } from '@/components/admin/providers/AdminDomFixes/tabs'

/**
 * The DOM-level fixes for Payload's markup (roadmap P6.2). Each helper only adds what is missing,
 * so these tests pin both halves: the fix is applied, and a future Payload version that ships its
 * own attribute is not overridden.
 */
describe('AdminDomFixes', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('ensureLandmarks', () => {
    const shell = (view = '<div class="dashboard">widgets</div>') => `
      <div class="template-default">
        <aside class="nav">links</aside>
        <div class="template-default__wrap">
          <header class="app-header">header</header>
          ${view}
        </div>
      </div>`

    it('names the view after the header as main and adds a skip link first in the body', () => {
      document.body.innerHTML = shell()

      ensureLandmarks(document, (key) => (key === 'a11y:skipToContent' ? 'Skip to content' : key))

      const view = document.querySelector('.dashboard')
      expect(view?.getAttribute('role')).toBe('main')
      expect(view?.id).toBe(MAIN_ID)
      // Focusable target: a skip link moves focus only to an element that accepts it.
      expect(view?.getAttribute('tabindex')).toBe('-1')

      const link = document.getElementById(SKIP_LINK_ID)
      expect(document.body.firstElementChild).toBe(link)
      expect(link?.getAttribute('href')).toBe(`#${MAIN_ID}`)
      expect(link?.textContent).toBe('Skip to content')
    })

    it('uses a native <main> the page already has, and does not add a second role', () => {
      document.body.innerHTML = shell('<main class="collection-edit">form</main>')

      ensureLandmarks(document)

      const main = document.querySelector('main')
      expect(main?.getAttribute('role')).toBeNull()
      expect(main?.id).toBe(MAIN_ID)
      expect(document.querySelectorAll('[role="main"]')).toHaveLength(0)
      expect(document.getElementById(SKIP_LINK_ID)?.getAttribute('href')).toBe(`#${MAIN_ID}`)
    })

    it('marks the sign-in screen as main without adding a skip link', () => {
      document.body.innerHTML =
        '<section class="login template-minimal"><div class="template-minimal__wrap">form</div></section>'

      ensureLandmarks(document)

      const login = document.querySelector('.login')
      expect(login?.getAttribute('role')).toBe('main')
      // No sidebar there, so there is nothing to skip.
      expect(document.getElementById(SKIP_LINK_ID)).toBeNull()
    })

    it('does nothing on a screen with neither the shell nor a minimal template', () => {
      document.body.innerHTML = '<div id="__next">public</div>'
      ensureLandmarks(document)
      expect(document.getElementById(SKIP_LINK_ID)).toBeNull()
      expect(document.querySelector('[role="main"]')).toBeNull()
    })

    it('keeps an existing role, id and tabindex', () => {
      document.body.innerHTML = shell('<div role="region" id="content" tabindex="0">view</div>')

      ensureLandmarks(document)

      const view = document.getElementById('content')
      expect(view?.getAttribute('role')).toBe('region')
      expect(view?.getAttribute('tabindex')).toBe('0')
      expect(document.getElementById(SKIP_LINK_ID)?.getAttribute('href')).toBe('#content')
    })

    it('follows client-side navigation without duplicating the link', () => {
      document.body.innerHTML = shell()
      ensureLandmarks(document)

      // Payload replaces the whole wrap on navigation: new header, new view.
      const wrap = document.querySelector('.template-default__wrap')
      if (wrap) {
        wrap.innerHTML = '<header class="app-header">header</header><div class="collection-list"></div>'
      }
      ensureLandmarks(document)

      expect(document.querySelectorAll(`#${SKIP_LINK_ID}`)).toHaveLength(1)
      const view = document.querySelector('.collection-list')
      expect(view?.getAttribute('role')).toBe('main')
      expect(document.getElementById(SKIP_LINK_ID)?.getAttribute('href')).toBe(`#${view?.id}`)
    })
  })

  describe('nameSelectionCheckboxes', () => {
    it('names the select-all box and removes its self-referencing aria-labelledby', () => {
      document.body.innerHTML = `
        <div class="select-all"><input type="checkbox" name="select-all" id="select-all"
          aria-label="" aria-labelledby="select-all"></div>`

      const seen: string[] = []
      nameSelectionCheckboxes(document, (key) => {
        seen.push(key)
        return key === SELECTION_LABELS.all ? 'Select all rows' : key
      })

      const box = document.querySelector<HTMLInputElement>('input[name="select-all"]')
      expect(box?.getAttribute('aria-label')).toBe('Select all rows')
      expect(box?.hasAttribute('aria-labelledby')).toBe(false)
      expect(seen).toEqual([SELECTION_LABELS.all])
    })

    it('names row checkboxes', () => {
      document.body.innerHTML = `
        <table><tbody><tr><td class="cell-_select">
          <div class="select-row__checkbox"><input type="checkbox" aria-label="" id="row-1"></div>
        </td></tr></tbody></table>`

      nameSelectionCheckboxes(document, () => 'Select row')

      expect(document.getElementById('row-1')?.getAttribute('aria-label')).toBe('Select row')
    })

    it('leaves labels Payload or a future version already provides, and unrelated boxes', () => {
      document.body.innerHTML = `
        <div class="select-all"><input type="checkbox" name="select-all" aria-label="Select all"></div>
        <div class="select-row__checkbox"><input type="checkbox" id="row" aria-label="Select article"></div>
        <label><input type="checkbox" id="plain"> Remember me</label>`

      nameSelectionCheckboxes(document)

      expect(document.querySelector('[name="select-all"]')?.getAttribute('aria-label')).toBe(
        'Select all',
      )
      expect(document.getElementById('row')?.getAttribute('aria-label')).toBe('Select article')
      expect(document.getElementById('plain')?.hasAttribute('aria-label')).toBe(false)
    })

    it('keeps a wrapping label that already names the box after the row', () => {
      document.body.innerHTML = `
        <td class="cell-_select"><div class="select-row__checkbox">
          <label><span class="sr-only">Select IT Department Manager</span>
            <input type="checkbox" aria-label=""></label>
        </div></td>`

      nameSelectionCheckboxes(document, () => 'Select row')

      // Untouched: still the empty attribute Payload renders, so the wrapping label wins the name.
      expect(document.querySelector('input[type="checkbox"]')?.getAttribute('aria-label')).toBe('')
    })

    it('is idempotent', () => {
      document.body.innerHTML = `<div class="select-all"><input type="checkbox" name="select-all" aria-label=""></div>`
      nameSelectionCheckboxes(document, () => 'Select all rows')
      nameSelectionCheckboxes(document, () => 'Select all rows')
      expect(document.querySelectorAll('[aria-label="Select all rows"]')).toHaveLength(1)
    })
  })

  describe('skipHiddenSelectControls', () => {
    it('takes Payload’s aria-hidden chevron and clear control out of the tab order', () => {
      document.body.innerHTML = `
        <button class="dropdown-indicator" aria-hidden="true" type="button"></button>
        <div class="clear-indicator" aria-hidden="true" role="button" tabindex="0"></div>`
      skipHiddenSelectControls(document)
      expect(document.querySelector('.dropdown-indicator')?.getAttribute('tabindex')).toBe('-1')
      expect(document.querySelector('.clear-indicator')?.getAttribute('tabindex')).toBe('-1')
    })

    it('leaves a visible chevron and an already-correct control alone', () => {
      document.body.innerHTML = `
        <button class="dropdown-indicator" type="button"></button>
        <div class="clear-indicator" aria-hidden="true" tabindex="-1"></div>`
      skipHiddenSelectControls(document)
      const [chevron, clear] = document.querySelectorAll('.dropdown-indicator, .clear-indicator')
      expect(chevron.hasAttribute('tabindex')).toBe(false)
      expect(clear.getAttribute('tabindex')).toBe('-1')
    })
  })

  describe('nameIconOnlyControls', () => {
    it('names the document menu and the upload edit/remove buttons', () => {
      document.body.innerHTML = `
        <div class="doc-controls__popup">
          <button class="popup-button" type="button"><div class="doc-controls__dots"></div></button>
        </div>
        <button class="upload-relationship-details__edit" type="button"><span class="btn__icon"></span></button>
        <button class="upload-relationship-details__remove" type="button"><span class="btn__icon"></span></button>
        <button class="date-time-picker__clear-button" type="button"><svg></svg></button>`

      const t = (key: string): string =>
        ({
          'a11y:moreDocumentActions': 'More document actions',
          'a11y:editFile': 'Edit file',
          'a11y:removeFile': 'Remove file',
          'a11y:clearDate': 'Clear date',
        })[key] ?? key
      nameIconOnlyControls(document, t)

      expect(document.querySelector('.popup-button')?.getAttribute('aria-label')).toBe(
        'More document actions',
      )
      expect(document.querySelector('.upload-relationship-details__edit')?.getAttribute('aria-label')).toBe(
        'Edit file',
      )
      expect(document.querySelector('.upload-relationship-details__remove')?.getAttribute('aria-label')).toBe(
        'Remove file',
      )
      expect(document.querySelector('.date-time-picker__clear-button')?.getAttribute('aria-label')).toBe(
        'Clear date',
      )
    })

    it('leaves a label Payload already provides, and a button with text, alone', () => {
      document.body.innerHTML = `
        <div class="doc-controls__popup"><button class="popup-button" aria-label="Document menu"></button></div>
        <button class="upload-relationship-details__edit">Edit</button>`
      nameIconOnlyControls(document, () => 'More document actions')
      expect(document.querySelector('.popup-button')?.getAttribute('aria-label')).toBe('Document menu')
      expect(document.querySelector('.upload-relationship-details__edit')?.hasAttribute('aria-label')).toBe(false)
    })
  })

  describe('folder browser fixes', () => {
    const translate = (key: string) =>
      (
        {
          'a11y:gridView': 'Grid view',
          'a11y:listView': 'List view',
          'a11y:folderActions': 'Folder actions',
          'a11y:filePreview': 'File preview',
        } as Record<string, string>
      )[key] ?? key

    it('names the grid/list toggles by the icon they render', () => {
      document.body.innerHTML = `
        <button class="folder-view-toggle-button"><svg class="icon icon--grid-view"></svg></button>
        <button class="folder-view-toggle-button"><svg class="icon icon--list-view"></svg></button>`
      nameFolderControls(document, translate)
      const labels = [...document.querySelectorAll('.folder-view-toggle-button')].map((button) =>
        button.getAttribute('aria-label'),
      )
      expect(labels).toEqual(['Grid view', 'List view'])
    })

    it('names the folder actions menu inside the folder view', () => {
      document.body.innerHTML =
        '<div class="current-folder-actions"><button class="popup-button"><div class="dots"></div></button></div>'
      nameFolderControls(document, translate)
      expect(document.querySelector('.current-folder-actions .popup-button')?.getAttribute('aria-label')).toBe(
        'Folder actions',
      )
    })

    it('uses the file name as the thumbnail alt, and falls back to a generic label', () => {
      document.body.innerHTML = `
        <div class="folder-file-card folder-file-card--file">
          <div class="folder-file-card__preview-area"><img src="/api/media/file/a.webp"></div>
          <p class="folder-file-card__name"><span>a.webp</span></p>
        </div>
        <div class="folder-file-card folder-file-card--file">
          <div class="folder-file-card__preview-area"><img src="/api/media/file/b.webp"></div>
        </div>`
      nameFolderThumbnails(document, translate)
      const alts = [...document.querySelectorAll('.folder-file-card--file img')].map((image) =>
        image.getAttribute('alt'),
      )
      expect(alts).toEqual(['a.webp', 'File preview'])
    })

    it('leaves an alt Payload already provides alone', () => {
      document.body.innerHTML = `
        <div class="folder-file-card folder-file-card--file">
          <div class="folder-file-card__preview-area"><img src="/x.webp" alt="Alt from Payload"></div>
          <p class="folder-file-card__name"><span>x.webp</span></p>
        </div>`
      nameFolderThumbnails(document, translate)
      expect(document.querySelector('img')?.getAttribute('alt')).toBe('Alt from Payload')
    })

    it('turns the create-folder div into a focusable button that responds to Enter', () => {
      document.body.innerHTML = '<div type="button" class="btn create-new-doc-in-folder__button">Create folder</div>'
      makeFolderCreateButtonFocusable(document)
      const button = document.querySelector<HTMLElement>('.create-new-doc-in-folder__button')
      expect(button?.getAttribute('role')).toBe('button')
      expect(button?.getAttribute('tabindex')).toBe('0')

      let clicks = 0
      button?.addEventListener('click', () => clicks++)
      button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(clicks).toBe(1)
    })

    it('does not touch the real button inside the multi-collection popup', () => {
      // With two folder-enabled collections Payload wraps a div in a real <button>; making the div
      // a button too would nest interactive controls (axe `nested-interactive`).
      document.body.innerHTML = `
        <div class="popup create-new-doc-in-folder__action-popup">
          <div class="popup__trigger-wrap"><button class="popup-button" type="button">
            <div type="button" class="btn create-new-doc-in-folder__popup-button">Create New</div>
          </button></div>
        </div>`
      makeFolderCreateButtonFocusable(document)
      const inner = document.querySelector('.create-new-doc-in-folder__popup-button')
      expect(inner?.hasAttribute('role')).toBe(false)
      expect(inner?.hasAttribute('tabindex')).toBe(false)
    })
  })

  describe('presentTabRows', () => {
    it('removes list semantics from a tab row with no list items', () => {
      document.body.innerHTML = `
        <ul class="doc-tabs__tabs"><div class="doc-tab">Edit</div><a class="doc-tab" href="/api">API</a></ul>`
      presentTabRows(document)
      expect(document.querySelector('.doc-tabs__tabs')?.getAttribute('role')).toBe('presentation')
    })

    it('leaves a real list, and an existing role, alone', () => {
      document.body.innerHTML = `
        <ul class="doc-tabs__tabs"><li>one</li></ul>
        <ul class="doc-tabs__tabs" role="tablist"><a href="#">tab</a></ul>`
      presentTabRows(document)
      const [list, tablist] = document.querySelectorAll('.doc-tabs__tabs')
      expect(list.hasAttribute('role')).toBe(false)
      expect(tablist.getAttribute('role')).toBe('tablist')
    })

    it('drops an aria-label that hides the visible tab text (the Versions count)', () => {
      document.body.innerHTML = `
        <ul class="doc-tabs__tabs"><a class="doc-tab" aria-label="Versions" href="#">Versions 1</a></ul>`
      trustVisibleTabText(document)
      expect(document.querySelector('a.doc-tab')?.hasAttribute('aria-label')).toBe(false)
    })

    it('keeps the label of a tab with no visible text', () => {
      document.body.innerHTML = `
        <ul class="doc-tabs__tabs"><a class="doc-tab" aria-label="Versions" href="#"><svg></svg></a></ul>`
      trustVisibleTabText(document)
      expect(document.querySelector('a.doc-tab')?.getAttribute('aria-label')).toBe('Versions')
    })
  })
})
