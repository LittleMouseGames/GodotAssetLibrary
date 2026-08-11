/* eslint-disable no-undef */
/**
 * We attach and namespace our utulity functions to avoid
 * collisions and create a predictable pattern for accessing
 * the methods that we need or want to use
 */
window.godotLibrary = {
  pageMessages: {
    addPageMessage: function (message, kind) {
      const pageMessageContainer = document.querySelector('.page-message .messages')
      const messageNode = document.createElement('div')
      messageNode.innerText = message
      messageNode.classList.add('message')
      if (kind === 'error' || kind === 'success') messageNode.classList.add(kind)
      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'message-close'
      close.setAttribute('aria-label', 'Dismiss message')
      close.textContent = '×'
      close.addEventListener('click', function () { messageNode.remove() })
      messageNode.appendChild(close)
      pageMessageContainer.appendChild(messageNode)
      window.setTimeout(function () { messageNode.remove() }, 5000)
    },

    removeAllPageMessages: function () {
      // write empty HTML to page messages container
      document.querySelector('.page-message .messages').innerHTML = ''
    }
  },
  dialog: {
    activeDialog: null,
    activeTrigger: null,
    scrollLocked: false,

    isOpen: function (dialogEl) {
      return dialogEl !== null && dialogEl.classList.contains('active')
    },

    open: function (dialogEl, triggerEl) {
      if (dialogEl === null) return
      if (this.activeDialog !== null && this.activeDialog !== dialogEl) {
        this.close(this.activeDialog)
      }
      this.activeDialog = dialogEl
      this.activeTrigger = triggerEl ?? null
      dialogEl.classList.add('active')
      dialogEl.setAttribute('aria-hidden', 'false')
      this.lockScroll()
      const focusable = dialogEl.querySelector('[data-autofocus]') ??
        dialogEl.querySelector('[data-dialog-close]') ??
        dialogEl.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (focusable instanceof HTMLElement) focusable.focus()
    },

    close: function (dialogEl) {
      if (dialogEl === null) return
      const wasActive = this.activeDialog === dialogEl
      dialogEl.classList.remove('active')
      dialogEl.setAttribute('aria-hidden', 'true')
      if (wasActive) {
        this.activeDialog = null
        this.unlockScroll()
        if (this.activeTrigger instanceof HTMLElement) {
          this.activeTrigger.focus()
          this.activeTrigger = null
        }
      }
    },

    closeActive: function () {
      if (this.activeDialog !== null) this.close(this.activeDialog)
    },

    lockScroll: function () {
      if (!this.scrollLocked) {
        this.scrollLocked = true
        document.body.style.overflow = 'hidden'
      }
    },

    unlockScroll: function () {
      if (this.scrollLocked) {
        this.scrollLocked = false
        document.body.style.overflow = ''
      }
    },

    trapFocus: function (event) {
      const dialogEl = this.activeDialog
      if (dialogEl === null || !dialogEl.classList.contains('active') || event.key !== 'Tab') return

      const focusables = Array.from(dialogEl.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.getClientRects().length > 0)

      if (focusables.length === 0) {
        event.preventDefault()
        dialogEl.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  },
  formTools: {
    sendFormAjax: function (e, form) {
      const method = (form.getAttribute('method') ?? 'POST').toUpperCase()
      const submitButton = form.querySelector('button[type="submit"]')
      if (submitButton !== null) {
        submitButton.disabled = true
        submitButton.setAttribute('aria-busy', 'true')
      }

      fetch(form.action, {
        method: method,
        body: new URLSearchParams(new FormData(form)),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        }
      }).then(async response => {
        window.godotLibrary.pageMessages.removeAllPageMessages()
        const contentType = response.headers.get('content-type') ?? ''
        let body = null
        try {
          body = contentType.includes('application/json') ? await response.json() : await response.text()
        } catch (_) {
          body = null
        }

        if (!response.ok) {
          const message = (body !== null && typeof body === 'object' && body.error) ||
            (typeof body === 'string' && body !== '') ||
            'Something went wrong, please try again'
          window.godotLibrary.pageMessages.addPageMessage(message)
          return
        }

        if (typeof body === 'object' && body !== null && body.redirect) {
          window.location.href = body.redirect
          return
        }

        window.godotLibrary.dialog.closeActive()
        window.godotLibrary.pageMessages.addPageMessage('Success!')
        if (body === null || body === '') {
          window.setTimeout(() => {
            location.reload()
          }, 1500)
        }
      }).catch(() => {
        window.godotLibrary.pageMessages.removeAllPageMessages()
        window.godotLibrary.pageMessages.addPageMessage('Network error, please try again')
      }).finally(() => {
        if (submitButton !== null) {
          submitButton.disabled = false
          submitButton.removeAttribute('aria-busy')
        }
      })
      e.preventDefault()
    }
  },
  siteFiles: {
    addRow: function () {
      const container = document.getElementById('site-files')
      const template = document.getElementById('site-file-row-template')
      if (container === null || template === null) return
      container.appendChild(template.content.cloneNode(true))
      const rows = container.querySelectorAll('.site-file-row')
      rows[rows.length - 1]?.querySelector('input')?.focus()
    }
  },
  clipboard: {
    copyText: function (text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text)
      }
      // Fallback for non-secure contexts (e.g. plain http on localhost).
      return new Promise(function (resolve, reject) {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'absolute'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        try {
          if (document.execCommand('copy')) {
            resolve()
          } else {
            reject(new Error('copy failed'))
          }
        } catch (e) {
          reject(e)
        }
        document.body.removeChild(ta)
      })
    }
  },
  dropdown: {
    getContainer: function (el) {
      if (el === null || el === undefined) return null
      return el.classList !== undefined && el.classList.contains('dropdown') ? el : (el.closest ? el.closest('.dropdown') : null)
    },
    showContent: function (event, el) {
      const dropdown = this.getContainer(el)
      if (dropdown === null) return

      const options = dropdown.querySelector('.options')
      const trigger = dropdown.querySelector('.dropdown-trigger')
      if (options === null) return

      const isOpen = !isHidden(options)
      closeAllDropdowns()
      if (!isOpen) {
        options.style.display = 'flex'
        trigger?.setAttribute('aria-expanded', 'true')
      } else {
        trigger?.setAttribute('aria-expanded', 'false')
      }
    },
    close: function (dropdown) {
      if (dropdown === null || dropdown === undefined) return
      const options = dropdown.querySelector('.options')
      const trigger = dropdown.querySelector('.dropdown-trigger')
      if (options !== null) options.style.display = 'none'
      trigger?.setAttribute('aria-expanded', 'false')
    },
    callRouteAjax: function (event, route, message, removeOnSuccess) {
      event.preventDefault()

      fetch(route, {
        method: 'get'
      }).then(response => {
        if (!response.ok) {
          response.json().then(data => {
            window.godotLibrary.pageMessages.removeAllPageMessages()
            window.godotLibrary.pageMessages.addPageMessage(data.error)
            setTimeout(() => {
              window.godotLibrary.pageMessages.removeAllPageMessages()
            }, 5000)
          })
        } else {
          window.godotLibrary.pageMessages.removeAllPageMessages()
          window.godotLibrary.pageMessages.addPageMessage(message)
          setTimeout(() => {
            window.godotLibrary.pageMessages.removeAllPageMessages()
          }, 5000)

          // Admin reports: after approving/ignoring a report, remove its card
          // so handled reports disappear instead of lingering on the page.
          if (removeOnSuccess !== undefined && removeOnSuccess instanceof Element) {
            removeOnSuccess.closest('.review-report')?.remove()
          }
        }
      })
    }
  },
  mobile: {
    closeSearch: function () {
      const search = document.querySelector('.search')
      const button = document.querySelector('.mobile-search-btn')
      search?.classList.remove('active')
      button?.setAttribute('aria-expanded', 'false')
      if (button instanceof HTMLElement) button.focus()
    },
    toggleSearch (event) {
      const search = document.querySelector('.search')
      const input = document.querySelector('#site-search')
      const button = document.querySelector('.mobile-search-btn')
      const isActive = search?.classList.contains('active') ?? false

      if (isActive) {
        this.closeSearch()
      } else {
        search?.classList.add('active')
        button?.setAttribute('aria-expanded', 'true')
        input?.focus()
      }
      event.stopPropagation()
    }
  },
  search: {
    toggleFilters: function (event) {
      const form = document.getElementById('search-filters-form')
      const button = event?.currentTarget
      if (form === null) return

      const isOpen = form.classList.contains('open')
      form.classList.toggle('open', !isOpen)
      button?.setAttribute('aria-expanded', isOpen ? 'false' : 'true')
      if (!isOpen) {
        const firstInput = form.querySelector('input:not([type="hidden"])')
        if (firstInput instanceof HTMLElement) firstInput.focus()
      }
    }
  },
  media: {
    activeTrigger: null,
    getLightbox: function () {
      return document.querySelector('.modal.media-lightbox')
    },
    getImageButtons: function () {
      return Array.from(document.querySelectorAll('.thumbnail-btn[data-media-type="image"]'))
    },
    switchToMedia: function (index) {
      const button = document.querySelector(`.thumbnail-btn[data-media-index="${index}"]`)
      const image = document.querySelector('.player .media-image')
      const iframe = document.querySelector('.player iframe.media-frame')

      if (button === null || image === null || iframe === null) return

      const type = button.getAttribute('data-media-type')
      const mediaUrl = button.getAttribute('data-media-url')
      const imageUrl = button.getAttribute('data-media-image-url')
      const displayUrl = button.getAttribute('data-media-display-url')

      document.querySelectorAll('.thumbnail-btn').forEach(item => {
        item.classList.remove('active')
        item.setAttribute('aria-current', 'false')
      })
      button.classList.add('active')
      button.setAttribute('aria-current', 'true')

      if (type === 'video' && mediaUrl !== null) {
        image.style.display = 'none'
        image.dataset.mediaIndex = ''
        iframe.style.display = 'block'
        iframe.src = mediaUrl
        return
      }

      if (imageUrl !== null) {
        iframe.src = 'about:blank'
        iframe.style.display = 'none'
        image.style.display = 'block'
        image.src = displayUrl || imageUrl
        image.dataset.fallbackImage = imageUrl
        image.dataset.mediaUrl = imageUrl
        image.dataset.mediaIndex = index
        image.dataset.triedFallback = 'false'
      }
    },
    showLightboxImage: function (index, fallbackUrl, fallbackAlt) {
      const lightbox = this.getLightbox()
      const image = lightbox?.querySelector('[data-media-lightbox-image]')
      const button = document.querySelector(`.thumbnail-btn[data-media-index="${index}"]`)

      if (lightbox === null || image === null) return

      const url = button?.getAttribute('data-media-image-url') ?? fallbackUrl
      if (url === null || url === undefined || url === '') return

      image.src = url
      image.dataset.fallbackImage = '/images/noimage.png'
      image.dataset.triedFallback = 'false'
      image.alt = button?.querySelector('img')?.alt ?? fallbackAlt ?? 'Asset preview image'
      lightbox.dataset.mediaIndex = index
    },
    openLightbox: function (trigger) {
      const lightbox = this.getLightbox()
      const image = lightbox?.querySelector('[data-media-lightbox-image]')
      const index = trigger.dataset.mediaIndex

      if (lightbox === null || image === null || index === undefined || index === '') return

      this.activeTrigger = trigger
      this.showLightboxImage(index, trigger.dataset.mediaUrl ?? trigger.dataset.fallbackImage ?? trigger.currentSrc, trigger.alt)
      window.godotLibrary.dialog.open(lightbox, trigger)
    },
    closeLightbox: function () {
      const lightbox = this.getLightbox()
      if (lightbox === null) return

      window.godotLibrary.dialog.close(lightbox)
    },
    moveLightbox: function (direction) {
      const lightbox = this.getLightbox()
      if (lightbox === null) return

      const buttons = this.getImageButtons()
      const current = buttons.findIndex(button => button.dataset.mediaIndex === lightbox.dataset.mediaIndex)
      if (current === -1 || buttons.length < 2) return

      const next = buttons[(current + direction + buttons.length) % buttons.length]
      this.showLightboxImage(next.dataset.mediaIndex)
    }
  },
  docs: {
    switchTo: function (name) {
      const isReadme = name === 'readme'
      document.querySelector('.readme')?.classList.toggle('active', isReadme)
      document.querySelector('.description')?.classList.toggle('active', !isReadme)
      const value = document.getElementById('docs-source-value')
      if (value !== null) value.textContent = isReadme ? 'README.md' : 'Description'
      const dropdown = document.querySelector('.docs .dropdown')
      if (dropdown !== null) window.godotLibrary.dropdown.close(dropdown)
    }
  }
}

document.addEventListener('click', function (event) {
  let inDropdown = false
  let inModal = false

  for (const dropdown of document.querySelectorAll('.dropdown')) {
    if (dropdown.contains(event.target)) {
      inDropdown = true
      break
    }
  }

  if (!inDropdown) {
    closeAllDropdowns()
  }

  for (const modal of document.querySelectorAll('.modal')) {
    if (modal.querySelector('.body')?.contains(event.target)) {
      inModal = true
      break
    }
  }

  if (!inModal) {
    closeAllModals()
  }

  if (!(event.target instanceof Element) || event.target.closest('.search') === null) {
    document.querySelector('.search')?.classList.remove('active')
    document.querySelector('.mobile-search-btn')?.setAttribute('aria-expanded', 'false')
  }
})

document.addEventListener('click', function (event) {
  const target = event.target
  if (!(target instanceof Element)) return

  const thumbnail = target.closest('.thumbnail-btn')
  if (thumbnail !== null) {
    window.godotLibrary.media.switchToMedia(thumbnail.dataset.mediaIndex)
    return
  }

  const mediaImage = target.closest('.media-image')
  if (mediaImage !== null) {
    window.godotLibrary.media.openLightbox(mediaImage)
    return
  }

  if (target.closest('[data-media-lightbox-close]') !== null) {
    window.godotLibrary.media.closeLightbox()
  } else if (target.closest('[data-media-lightbox-previous]') !== null) {
    window.godotLibrary.media.moveLightbox(-1)
  } else if (target.closest('[data-media-lightbox-next]') !== null) {
    window.godotLibrary.media.moveLightbox(1)
  }
})

document.addEventListener('click', function (event) {
  const target = event.target
  if (!(target instanceof Element)) return

  const openTrigger = target.closest('[data-dialog-open]')
  if (openTrigger !== null) {
    const dialogId = openTrigger.getAttribute('data-dialog-open')
    const dialogEl = document.querySelector(`[data-dialog="${dialogId}"]`)
    if (dialogEl !== null) {
      const commentId = openTrigger.getAttribute('data-report-comment-id')
      if (commentId !== null && commentId !== '') {
        const form = dialogEl.querySelector('form')
        if (form !== null) form.setAttribute('action', `/asset/report/review/${commentId}`)
      }
      window.godotLibrary.dialog.open(dialogEl, openTrigger)
    }
    event.preventDefault()
    return
  }

  if (target.closest('[data-dialog-close]') !== null) {
    const dialogEl = target.closest('.modal')
    if (dialogEl !== null) window.godotLibrary.dialog.close(dialogEl)
  }
})

document.addEventListener('click', function (event) {
  const target = event.target
  if (!(target instanceof Element)) return

  const copyTrigger = target.closest('[data-copy-text], [data-copy-selector]')
  if (copyTrigger !== null) {
    event.preventDefault()
    let text = ''
    if (copyTrigger.hasAttribute('data-copy-text')) {
      text = copyTrigger.getAttribute('data-copy-text')
    } else {
      const selector = copyTrigger.getAttribute('data-copy-selector')
      text = (document.querySelector(selector)?.textContent ?? '').trim()
    }
    const btn = copyTrigger
    const original = btn.textContent
    window.godotLibrary.clipboard.copyText(text).then(() => {
      btn.textContent = 'Copied!'
      window.godotLibrary.pageMessages.addPageMessage('Copied to clipboard')
    }).catch(() => {
      window.godotLibrary.pageMessages.addPageMessage('Could not copy — select the text manually')
    }).finally(() => {
      window.setTimeout(() => { btn.textContent = original }, 2000)
    })
  }
})

document.addEventListener('click', function (event) {
  const target = event.target
  if (!(target instanceof Element)) return

  const saveButton = target.closest('[data-save-asset]')
  if (saveButton === null) return
  event.preventDefault()

  const assetId = saveButton.getAttribute('data-save-asset')
  const desired = saveButton.getAttribute('data-saved') !== 'true'

  saveButton.disabled = true
  saveButton.setAttribute('aria-busy', 'true')

  fetch(`/dashboard/assets/${assetId}/saved`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saved: desired })
  }).then(async response => {
    window.godotLibrary.pageMessages.removeAllPageMessages()
    if (!response.ok) {
      let message = 'Something went wrong, please try again'
      try {
        const data = await response.json()
        if (data && data.error) message = data.error
      } catch (e) {
        // keep default message
      }
      window.godotLibrary.pageMessages.addPageMessage(message)
      return
    }

    // Sync every control that references this asset (desktop/mobile copies).
    document.querySelectorAll(`[data-save-asset="${assetId}"]`).forEach(control => {
      control.setAttribute('data-saved', desired ? 'true' : 'false')
      control.setAttribute('aria-pressed', desired ? 'true' : 'false')
      control.innerText = desired ? 'Unsave' : 'Save'
    })
    window.godotLibrary.pageMessages.addPageMessage(desired ? 'Asset saved' : 'Asset removed from saves')
    closeAllDropdowns()

    // On the saved-assets page, unsaving should remove the card immediately
    // and show an empty state when nothing is left.
    if (window.location.pathname.startsWith('/dashboard/saved') && !desired) {
      const card = saveButton.closest('.asset-card')
      if (card !== null) card.remove()
      const remaining = document.querySelectorAll('.catalog-grid .results .asset-card').length
      if (remaining === 0) {
        const empty = document.createElement('div')
        empty.className = 'no-results'
        empty.innerHTML = '<p>You have no saved assets.</p><a href="/search/" title="Browse all assets">Browse assets</a>'
        const results = document.querySelector('.catalog-grid .results')
        if (results !== null) results.replaceChildren(empty)
      }
    }
  }).catch(() => {
    window.godotLibrary.pageMessages.removeAllPageMessages()
    window.godotLibrary.pageMessages.addPageMessage('Network error, please try again')
  }).finally(() => {
    saveButton.disabled = false
    saveButton.removeAttribute('aria-busy')
  })
})

document.addEventListener('keydown', function (event) {
  const lightbox = window.godotLibrary.media.getLightbox()
  if (lightbox === null || !lightbox.classList.contains('active')) return

  if (event.key === 'ArrowLeft') {
    window.godotLibrary.media.moveLightbox(-1)
  } else if (event.key === 'ArrowRight') {
    window.godotLibrary.media.moveLightbox(1)
  }
})

document.addEventListener('keydown', function (event) {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target
  if (target instanceof HTMLElement &&
      (target.matches('input, textarea, select') || target.isContentEditable)) return
  const input = document.getElementById('site-search')
  if (input !== null) {
    event.preventDefault()
    input.focus()
    input.select()
  }
})

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') {
    window.godotLibrary.dialog.closeActive()
    return
  }
  window.godotLibrary.dialog.trapFocus(event)
})

document.addEventListener('change', function (event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  if (target.matches('.query-link') && target.value !== '') {
    window.location.href = target.value
  }
})

document.addEventListener('keydown', function (event) {
  if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.matches('.media-image')) {
    event.preventDefault()
    window.godotLibrary.media.openLightbox(event.target)
  }
})

document.addEventListener('load', function (event) {
  const image = event.target
  if (!(image instanceof HTMLImageElement) || image.src.endsWith('/images/noimage.png')) return

  // Lazysizes swaps src from a small placeholder to data-src. Remember the
  // working placeholder so a failed larger variant does not discard it.
  image.dataset.lastSuccessfulSrc = image.currentSrc || image.src
}, true)

document.addEventListener('error', function (event) {
  const image = event.target
  if (!(image instanceof HTMLImageElement)) return

  const source = image.getAttribute('src') ?? ''
  const previousSource = image.dataset.lastSuccessfulSrc

  if (image.classList.contains('lazyload') && previousSource !== undefined && previousSource !== '' && source !== previousSource) {
    image.classList.remove('lazyload')
    image.removeAttribute('data-src')
    image.src = previousSource
    image.dataset.triedFallback = 'complete'
    return
  }

  if (image.dataset.triedFallback === 'true') {
    image.src = '/images/noimage.png'
    image.dataset.triedFallback = 'complete'
    return
  }

  image.dataset.triedFallback = 'true'
  const host = image.dataset.host
  const fallback = image.dataset.fallbackImage

  if (host !== undefined && source !== '' && !/^(https?:|data:|\/)/i.test(source)) {
    image.src = `${host}${source}`
  } else if (fallback !== undefined && fallback !== '') {
    if (new URL(fallback, document.baseURI).href === new URL(source, document.baseURI).href) {
      image.src = '/images/noimage.png'
      image.dataset.triedFallback = 'complete'
    } else {
      image.src = fallback
    }
  } else {
    image.src = '/images/noimage.png'
  }
}, true)

function isHidden (el) {
  const style = window.getComputedStyle(el)
  return (style.display === 'none')
}

function closeAllDropdowns () {
  document.querySelectorAll('.dropdown').forEach(dropdown => {
    const options = dropdown.querySelector('.options')
    if (options !== null) options.style.display = 'none'
    const trigger = dropdown.querySelector('.dropdown-trigger')
    trigger?.setAttribute('aria-expanded', 'false')
  })
}

function closeAllModals () {
  document.querySelectorAll('.modal').forEach(element => {
    if (element.hasAttribute('data-dialog')) {
      window.godotLibrary.dialog.close(element)
    } else {
      element.classList.remove('active')
    }
  })
}

document.addEventListener('DOMContentLoaded', function (_event) {
  document.querySelectorAll('.accordion').forEach(accordion => {
    const trigger = accordion.querySelector('.accordion-trigger')
    const content = accordion.querySelector('.accordion-content')
    const openIcon = accordion.querySelector('.icon-close')
    const closeIcon = accordion.querySelector('.icon-expand')
    if (trigger === null || content === null) return

    const panelId = accordion.id !== '' ? `${accordion.id}-panel` : null
    if (trigger instanceof HTMLElement) {
      trigger.setAttribute('aria-expanded', 'false')
      if (panelId !== null) trigger.setAttribute('aria-controls', panelId)
      content.setAttribute('id', panelId ?? '')
    }

    trigger.addEventListener('click', function () {
      const isOpen = !isHidden(content)
      content.style.display = isOpen ? 'none' : 'block'
      openIcon.style.display = isOpen ? 'none' : 'block'
      closeIcon.style.display = isOpen ? 'block' : 'none'
      trigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true')
    })
  })
})

// Close any open disclosure and return focus to its trigger on Escape.
document.addEventListener('keydown', function (event) {
  if (event.key !== 'Escape') return

  let openDropdown = null
  for (const dropdown of document.querySelectorAll('.dropdown')) {
    const options = dropdown.querySelector('.options')
    if (options !== null && !isHidden(options)) {
      openDropdown = dropdown
      break
    }
  }

  if (openDropdown !== null) {
    const trigger = openDropdown.querySelector('.dropdown-trigger')
    window.godotLibrary.dropdown.close(openDropdown)
    if (trigger instanceof HTMLElement) trigger.focus()
    return
  }

  const search = document.querySelector('.search')
  if (search?.classList.contains('active')) {
    window.godotLibrary.mobile.closeSearch()
  }
})

// Mobile search close control is a real button; clicking it closes the overlay.
document.addEventListener('click', function (event) {
  const target = event.target
  if (!(target instanceof Element)) return
  const closeButton = target.closest('.search .close')
  if (closeButton !== null) {
    window.godotLibrary.mobile.closeSearch()
    event.stopPropagation()
  }
})
