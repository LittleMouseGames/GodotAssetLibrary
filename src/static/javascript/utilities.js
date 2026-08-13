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
        method: 'post'
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
  theme: {
    key: 'godot-theme',
    mediaQuery: null,

    init: function () {
      // Listen for OS theme changes ONLY while the user is on "System".
      if (typeof window.matchMedia === 'function') {
        const self = this
        this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        const listener = function () {
          if (self.getStored() === 'system') self.apply(self.resolve('system'))
        }
        if (typeof this.mediaQuery.addEventListener === 'function') {
          this.mediaQuery.addEventListener('change', listener)
        } else if (typeof this.mediaQuery.addListener === 'function') {
          this.mediaQuery.addListener(listener)
        }
      }
      this.syncControl()
    },

    getStored: function () {
      try {
        const value = window.localStorage.getItem(this.key)
        return (value === 'light' || value === 'dark' || value === 'system') ? value : 'system'
      } catch (e) {
        return 'system'
      }
    },

    setStored: function (value) {
      try { window.localStorage.setItem(this.key, value) } catch (e) { /* storage unavailable */ }
    },

    resolve: function (theme) {
      if (theme === 'system') {
        if (this.mediaQuery != null && this.mediaQuery.matches) return 'dark'
        return 'light'
      }
      return theme
    },

    apply: function (resolved) {
      document.documentElement.setAttribute('data-theme', resolved)
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta !== null) meta.setAttribute('content', resolved === 'dark' ? '#141518' : '#ffffff')
    },

    set: function (theme) {
      if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return
      this.setStored(theme)
      this.apply(this.resolve(theme))
      this.syncControl()
    },

    syncControl: function () {
      const stored = this.getStored()
      const control = document.querySelector('[data-theme-control]')
      if (control === null) return

      const label = control.querySelector('.theme-label')
      if (label !== null) label.textContent = stored.charAt(0).toUpperCase() + stored.slice(1)

      const icon = control.querySelector('.theme-icon')
      if (icon !== null) {
        const icons = { system: 'mdi:theme-light-dark', light: 'mdi:white-balance-sunny', dark: 'mdi:weather-night' }
        icon.setAttribute('data-icon', icons[stored] ?? icons.system)
      }

      control.querySelectorAll('[data-theme]').forEach(option => {
        option.classList.toggle('active', option.getAttribute('data-theme') === stored)
      })
    }
  },
  media: {
    activeTrigger: null,
    selectedIndex: 0,

    getStage: function () {
      return document.querySelector('.player .container[data-media-stage]')
    },
    getLightbox: function () {
      return document.querySelector('.modal.media-lightbox')
    },
    getThumbnails: function () {
      return Array.from(document.querySelectorAll('.thumbnail-btn'))
    },
    getThumbnail: function (index) {
      return document.querySelector(`.thumbnail-btn[data-media-index="${index}"]`) ?? null
    },
    /** Gallery indices that are images (the lightbox is image-only). */
    getImageIndices: function () {
      const indices = []
      for (const button of this.getThumbnails()) {
        if (button.getAttribute('data-media-type') === 'image') {
          indices.push(button.getAttribute('data-media-index'))
        }
      }
      const primary = document.querySelector('.player .media-image-button')
      if (primary !== null) {
        const index = primary.getAttribute('data-media-index')
        if (index !== null && index !== '' && !indices.includes(index)) indices.push(index)
      }
      return indices
    },
    init: function () {
      const active = this.getThumbnails().find(button => button.classList.contains('active'))
      if (active !== undefined) this.selectedIndex = Number(active.getAttribute('data-media-index'))
      this.updateCounter()
      this.updateLightboxNav()
      this.wireSwipe()
    },
    switchToMedia: function (index) {
      const thumb = this.getThumbnail(index)
      if (thumb === null) return

      const type = thumb.getAttribute('data-media-type')
      const stage = this.getStage()
      const imageLayer = stage?.querySelector('.media-image-layer')
      const videoLayer = stage?.querySelector('.media-video-layer')
      const image = stage?.querySelector('.media-image')
      const iframe = stage?.querySelector('[data-media-iframe]')
      const poster = stage?.querySelector('.video-cover')

      this.selectedIndex = Number(index)

      for (const button of this.getThumbnails()) {
        button.classList.remove('active')
        button.setAttribute('aria-current', 'false')
      }
      thumb.classList.add('active')
      thumb.setAttribute('aria-current', 'true')

      if (type === 'video') {
        if (imageLayer !== null) imageLayer.style.display = 'none'
        if (videoLayer !== null) videoLayer.style.display = 'block'
        // Click-to-load: show the poster and wait for an explicit play
        // gesture before creating/loading the privacy-enhanced iframe.
        if (iframe !== null) {
          iframe.src = 'about:blank'
          iframe.style.display = 'none'
        }
        if (poster !== null) {
          const posterImage = poster.querySelector('img')
          const thumbImage = thumb.querySelector('img')
          if (posterImage !== null && thumbImage !== null) {
            posterImage.src = thumbImage.currentSrc || thumbImage.src || thumbImage.dataset?.fallbackImage || '/images/noimage.png'
            posterImage.dataset.triedFallback = 'false'
          }
          poster.style.display = 'flex'
        }
        if (videoLayer !== null) {
          videoLayer.setAttribute('data-media-url', thumb.getAttribute('data-media-url') ?? '')
        }
      } else {
        if (videoLayer !== null) {
          const videoIframe = videoLayer.querySelector('[data-media-iframe]')
          if (videoIframe !== null) videoIframe.src = 'about:blank'
          videoLayer.style.display = 'none'
        }
        if (imageLayer !== null) {
          imageLayer.style.display = 'block'
          if (image !== null) {
            const thumbImage = thumb.querySelector('img')
            image.src = thumb.getAttribute('data-media-display-url') ||
              thumb.getAttribute('data-media-image-url') ||
              thumb.getAttribute('data-media-url') ||
              '/images/noimage.png'
            image.dataset.fallbackImage = thumb.getAttribute('data-media-image-url') ?? ''
            image.dataset.mediaIndex = index
            image.dataset.mediaUrl = thumb.getAttribute('data-media-image-url') ?? ''
            image.dataset.triedFallback = 'false'
            image.setAttribute('alt', thumbImage?.getAttribute('alt') ?? 'Asset preview image')
            // openLightbox reads the index from the focusable wrapper button,
            // so keep it in sync with the image itself.
            const imageButton = image.closest('.media-image-button')
            if (imageButton !== null) imageButton.setAttribute('data-media-index', index)
          }
        }
      }

      this.updateCounter()
      this.scrollThumbnailIntoView(index)
      this.refreshLazy()
    },
    playVideo: function () {
      const stage = this.getStage()
      const videoLayer = stage?.querySelector('.media-video-layer')
      const iframe = stage?.querySelector('[data-media-iframe]')
      const poster = stage?.querySelector('.video-cover')
      if (videoLayer === null || iframe === null) return

      const baseUrl = videoLayer.getAttribute('data-media-url') ?? ''
      if (baseUrl === '' || baseUrl === 'about:blank') return

      iframe.src = baseUrl + (baseUrl.indexOf('?') === -1 ? '?autoplay=1' : '&autoplay=1')
      iframe.style.display = 'block'
      if (poster !== null) poster.style.display = 'none'
    },
    previous: function () { this.move(-1) },
    next: function () { this.move(1) },
    move: function (direction) {
      const thumbs = this.getThumbnails()
      if (thumbs.length < 2) return
      const current = thumbs.findIndex(button => Number(button.getAttribute('data-media-index')) === this.selectedIndex)
      if (current === -1) return
      const next = thumbs[(current + direction + thumbs.length) % thumbs.length]
      this.switchToMedia(next.getAttribute('data-media-index'))
    },
    scrollThumbnailIntoView: function (index) {
      const thumb = this.getThumbnail(index)
      const viewport = document.querySelector('[data-media-rail-viewport]')
      if (thumb === null || viewport === null) return
      const left = Math.max(0, thumb.offsetLeft - (viewport.clientWidth - thumb.clientWidth) / 2)
      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({ left, behavior: 'smooth' })
      } else {
        viewport.scrollLeft = left
      }
    },
    scrollRail: function (direction) {
      const viewport = document.querySelector('[data-media-rail-viewport]')
      if (viewport === null) return
      if (typeof viewport.scrollBy === 'function') {
        viewport.scrollBy({ left: direction * viewport.clientWidth * 0.8, behavior: 'smooth' })
      } else {
        viewport.scrollLeft += direction * viewport.clientWidth * 0.8
      }
    },
    refreshLazy: function () {
      if (typeof window.lazySizes !== 'undefined' && typeof window.lazySizes.updateAll === 'function') {
        window.lazySizes.updateAll()
      } else {
        window.dispatchEvent(new Event('resize'))
      }
    },
    updateCounter: function () {
      const total = this.getThumbnails().length
      const counter = document.querySelector('[data-media-counter]')
      if (counter === null) return
      if (total < 2) {
        counter.style.display = 'none'
        return
      }
      counter.style.display = ''
      counter.textContent = `${this.selectedIndex + 1} / ${total}`
    },
    showLightboxImage: function (index, fallbackUrl, fallbackAlt) {
      const lightbox = this.getLightbox()
      const image = lightbox?.querySelector('[data-media-lightbox-image]')
      const thumb = this.getThumbnail(index)
      if (lightbox === null || image === null) return

      const url = thumb?.getAttribute('data-media-image-url') ?? fallbackUrl
      if (url === null || url === undefined || url === '') return

      image.src = url
      image.dataset.fallbackImage = '/images/noimage.png'
      image.dataset.triedFallback = 'false'
      image.alt = thumb?.querySelector('img')?.getAttribute('alt') ?? fallbackAlt ?? 'Asset preview image'
      lightbox.dataset.mediaIndex = index
      const caption = lightbox.querySelector('[data-lightbox-caption]')
      if (caption !== null) caption.textContent = image.alt
      this.updateLightboxCounter(index)
      this.syncLightboxStrip(index)
    },
    updateLightboxCounter: function (index) {
      const indices = this.getImageIndices()
      const lightbox = this.getLightbox()
      const counter = lightbox?.querySelector('[data-lightbox-counter]')
      if (counter === null) return
      const position = indices.indexOf(String(index))
      counter.textContent = position >= 0 ? `${position + 1} / ${indices.length}` : ''
    },
    syncLightboxStrip: function (index) {
      const lightbox = this.getLightbox()
      const strip = lightbox?.querySelector('[data-lightbox-strip]')
      if (lightbox === null || strip === null) return
      const indices = this.getImageIndices()

      strip.replaceChildren()
      for (const imageIndex of indices) {
        const thumb = this.getThumbnail(imageIndex)
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'lightbox-strip-item'
        button.setAttribute('aria-label', 'Show image')
        if (String(imageIndex) === String(index)) {
          button.classList.add('active')
          button.setAttribute('aria-current', 'true')
        }
        const img = document.createElement('img')
        img.src = thumb?.querySelector('img')?.getAttribute('src') ?? thumb?.getAttribute('data-media-image-url') ?? '/images/noimage.png'
        img.alt = ''
        img.loading = 'lazy'
        img.decoding = 'async'
        button.appendChild(img)
        button.addEventListener('click', function () {
          window.godotLibrary.media.showLightboxImage(imageIndex)
        })
        strip.appendChild(button)
      }
    },
    openLightbox: function (trigger) {
      const lightbox = this.getLightbox()
      const image = lightbox?.querySelector('[data-media-lightbox-image]')
      const index = trigger.getAttribute('data-media-index')

      if (lightbox === null || image === null || index === undefined || index === '') return

      this.activeTrigger = trigger
      this.showLightboxImage(
        index,
        trigger.getAttribute('data-media-url') ?? trigger.getAttribute('data-fallback-image') ?? '/images/noimage.png',
        trigger.getAttribute('aria-label') ?? ''
      )
      window.godotLibrary.dialog.open(lightbox, trigger)
      this.updateLightboxNav()
    },
    updateLightboxNav: function () {
      const lightbox = this.getLightbox()
      if (lightbox === null) return
      const count = this.getImageIndices().length
      const prev = lightbox.querySelector('[data-media-lightbox-previous]')
      const next = lightbox.querySelector('[data-media-lightbox-next]')
      const strip = lightbox.querySelector('[data-lightbox-strip]')
      if (prev !== null) prev.style.display = count < 2 ? 'none' : ''
      if (next !== null) next.style.display = count < 2 ? 'none' : ''
      if (strip !== null) strip.style.display = count < 2 ? 'none' : ''
    },
    closeLightbox: function () {
      const lightbox = this.getLightbox()
      if (lightbox === null) return
      window.godotLibrary.dialog.close(lightbox)
    },
    moveLightbox: function (direction) {
      const lightbox = this.getLightbox()
      if (lightbox === null || !lightbox.classList.contains('active')) return

      const indices = this.getImageIndices()
      const current = indices.indexOf(lightbox.dataset.mediaIndex)
      if (current === -1 || indices.length < 2) return

      const next = (current + direction + indices.length) % indices.length
      this.showLightboxImage(indices[next])
    },
    wireSwipe: function () {
      const stage = this.getStage()
      if (stage === null) return

      let startX = 0
      let startY = 0
      let tracking = false

      stage.addEventListener('touchstart', function (event) {
        const touch = event.changedTouches?.[0]
        if (touch === undefined) return
        startX = touch.clientX
        startY = touch.clientY
        tracking = true
      }, { passive: true })

      stage.addEventListener('touchend', function (event) {
        if (!tracking) return
        tracking = false
        const touch = event.changedTouches?.[0]
        if (touch === undefined) return
        const deltaX = touch.clientX - startX
        const deltaY = touch.clientY - startY
        // Only horizontal swipes navigate; keep vertical scrolling intact.
        if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
          window.godotLibrary.media.move(deltaX < 0 ? 1 : -1)
        }
      }, { passive: true })
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
  },
  heroCarousel: {
    instances: [],

    prefersReducedMotion: function () {
      return typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    },

    initAll: function () {
      const self = this
      this.instances = []
      document.querySelectorAll('[data-hero-carousel]').forEach(function (root) {
        self.instances.push(self.create(root))
      })

      // Pause rotation whenever the whole document becomes hidden.
      document.addEventListener('visibilitychange', function () {
        for (const instance of self.instances) {
          instance.documentHidden = document.hidden === true
          self.syncAutoplay(instance)
        }
      })

      // Respect reduced-motion at runtime (not just at load).
      if (typeof window.matchMedia === 'function') {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)')
        const listener = function () {
          for (const instance of self.instances) self.syncAutoplay(instance)
        }
        if (typeof query.addEventListener === 'function') query.addEventListener('change', listener)
        else if (typeof query.addListener === 'function') query.addListener(listener)
      }
    },

    create: function (root) {
      const self = this
      const slides = Array.from(root.querySelectorAll('[data-hero-slide]'))
      const instance = {
        root: root,
        slides: slides,
        dots: Array.from(root.querySelectorAll('[data-hero-dot]')),
        status: root.querySelector('[data-hero-status]'),
        index: 0,
        timer: null,
        autoplayMs: Number(root.getAttribute('data-hero-autoplay')) || 7000,
        documentHidden: false,
        hovered: false,
        focused: false,
        inView: true,
        userPaused: false
      }

      if (instance.slides.length < 2) return instance

      // JavaScript is running: remove the server-side `hidden` markers so all
      // slides stack and the active one can crossfade (opacity/visibility).
      slides.forEach(function (slide) { slide.removeAttribute('hidden') })

      this.wireControls(instance)
      this.wireKeyboard(instance)
      this.wireSwipe(instance)

      root.addEventListener('mouseenter', function () { instance.hovered = true; self.syncAutoplay(instance) })
      root.addEventListener('mouseleave', function () { instance.hovered = false; self.syncAutoplay(instance) })
      root.addEventListener('focusin', function () { instance.focused = true; self.syncAutoplay(instance) })
      root.addEventListener('focusout', function () { instance.focused = false; self.syncAutoplay(instance) })

      if (typeof IntersectionObserver === 'function') {
        instance.observer = new IntersectionObserver(function (entries) {
          const entry = entries[0]
          instance.inView = entry === undefined ? true : entry.isIntersecting
          self.syncAutoplay(instance)
        })
        instance.observer.observe(root)
      }

      // Start rotation only when every pause condition is clear (reduced
      // motion, hidden document, off-screen, hover/focus or explicit pause).
      this.syncAutoplay(instance)
      return instance
    },

    wireControls: function (instance) {
      const self = this
      const prev = instance.root.querySelector('[data-hero-prev]')
      const next = instance.root.querySelector('[data-hero-next]')
      const play = instance.root.querySelector('[data-hero-play]')

      prev?.addEventListener('click', function () {
        self.move(instance, -1, 'manual')
      })
      next?.addEventListener('click', function () {
        self.move(instance, 1, 'manual')
      })

      instance.dots.forEach(function (dot) {
        dot.addEventListener('click', function () {
          self.show(instance, Number(dot.getAttribute('data-hero-dot')), 'manual')
        })
      })

      play?.addEventListener('click', function (event) {
        // The pause control must never leak its click to anything else (a link
        // or a slide advance), even if a cached/older layout overlapped it.
        event.preventDefault()
        event.stopPropagation()
        instance.userPaused = !instance.userPaused
        self.syncAutoplay(instance)
        const paused = instance.userPaused
        play.setAttribute('aria-pressed', paused ? 'false' : 'true')
        play.setAttribute('aria-label', paused ? 'Play automatic rotation' : 'Pause automatic rotation')
        // Swap the icon so pausing/playing has clear visual feedback (Iconify
        // observes the data-icon attribute change and re-renders the glyph).
        const icon = play.querySelector('.iconify')
        if (icon !== null) {
          icon.setAttribute('data-icon', paused ? 'akar-icons:play' : 'akar-icons:pause')
        }
      })
    },

    wireKeyboard: function (instance) {
      const self = this
      instance.root.addEventListener('keydown', function (event) {
        // Never hijack keys while the user is typing in a form control.
        const target = event.target
        if (target instanceof Element && target.closest('input, textarea, select')) return
        const key = event.key
        if (key === 'ArrowLeft') {
          event.preventDefault()
          self.move(instance, -1, 'manual')
        } else if (key === 'ArrowRight') {
          event.preventDefault()
          self.move(instance, 1, 'manual')
        } else if (key === 'Home') {
          event.preventDefault()
          self.show(instance, 0, 'manual')
        } else if (key === 'End') {
          event.preventDefault()
          self.show(instance, instance.slides.length - 1, 'manual')
        }
      })
    },

    wireSwipe: function (instance) {
      const root = instance.root
      let startX = 0
      let startY = 0
      let tracking = false

      root.addEventListener('touchstart', function (event) {
        const touch = event.changedTouches?.[0]
        if (touch === undefined) return
        startX = touch.clientX
        startY = touch.clientY
        tracking = true
      }, { passive: true })

      root.addEventListener('touchend', function (event) {
        if (!tracking) return
        tracking = false
        const touch = event.changedTouches?.[0]
        if (touch === undefined) return
        const deltaX = touch.clientX - startX
        const deltaY = touch.clientY - startY
        // Only horizontal swipes navigate; keep vertical scrolling intact.
        if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
          window.godotLibrary.heroCarousel.move(instance, deltaX < 0 ? 1 : -1, 'manual')
        }
      }, { passive: true })
    },

    show: function (instance, index, reason) {
      const total = instance.slides.length
      if (total === 0) return
      const next = ((index % total) + total) % total
      instance.index = next

      instance.slides.forEach(function (slide, i) {
        slide.classList.toggle('active', i === next)
      })
      instance.dots.forEach(function (dot, i) {
        const active = i === next
        dot.classList.toggle('active', active)
        if (active) dot.setAttribute('aria-current', 'true')
        else dot.removeAttribute('aria-current')
      })

      // Manual navigation announces the current slide; autoplay stays silent
      // so screen readers are not spammed every few seconds.
      if (reason === 'manual') {
        const title = instance.slides[next]?.querySelector('.hero-title')?.textContent?.trim() ?? ''
        if (instance.status !== null) {
          instance.status.textContent =
            'Slide ' + (next + 1) + ' of ' + total + (title !== '' ? ': ' + title : '')
        }
      }

      // Let lazysizes load the newly visible slide's imagery.
      if (typeof window.lazySizes !== 'undefined' && typeof window.lazySizes.updateAll === 'function') {
        window.lazySizes.updateAll()
      } else {
        window.dispatchEvent(new Event('resize'))
      }

      this.restart(instance)
    },

    move: function (instance, direction, reason) {
      this.show(instance, instance.index + direction, reason)
    },

    syncAutoplay: function (instance) {
      if (instance.slides.length < 2) {
        this.stop(instance)
        return
      }
      const shouldRun = !this.prefersReducedMotion() &&
        !instance.documentHidden &&
        !instance.userPaused &&
        !instance.hovered &&
        !instance.focused &&
        instance.inView
      if (shouldRun) this.start(instance)
      else this.stop(instance)
    },

    start: function (instance) {
      if (instance.timer !== null) return
      const self = this
      instance.timer = setInterval(function () {
        self.move(instance, 1, 'autoplay')
      }, instance.autoplayMs)
    },

    stop: function (instance) {
      if (instance.timer !== null) {
        clearInterval(instance.timer)
        instance.timer = null
      }
    },

    restart: function (instance) {
      this.stop(instance)
      this.syncAutoplay(instance)
    }
  },
  featuredAssets: {
    /** Move a hero-management row up (-1) or down (+1); DOM order is the order. */
    move: function (button, offset) {
      const row = button.closest('[data-hero-row]')
      const list = button.closest('[data-hero-rows]')
      if (row === null || list === null) return
      const rows = Array.from(list.querySelectorAll('[data-hero-row]'))
      const index = rows.indexOf(row)
      const target = index + offset
      if (target < 0 || target >= rows.length) return
      if (offset < 0) {
        list.insertBefore(row, rows[target])
      } else {
        list.insertBefore(row, rows[target].nextSibling)
      }
      this.syncButtons()
    },
    remove: function (button) {
      const row = button.closest('[data-hero-row]')
      if (row !== null) row.remove()
      this.syncButtons()
    },
    syncButtons: function () {
      document.querySelectorAll('[data-hero-rows]').forEach(function (list) {
        const rows = Array.from(list.querySelectorAll('[data-hero-row]'))
        rows.forEach(function (row, index) {
          const up = row.querySelector('[data-hero-up]')
          const down = row.querySelector('[data-hero-down]')
          if (up !== null) up.disabled = index === 0
          if (down !== null) down.disabled = index === rows.length - 1
        })
      })
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

  const playButton = target.closest('[data-media-play]')
  if (playButton !== null) {
    window.godotLibrary.media.playVideo()
    return
  }

  const mediaImageButton = target.closest('.media-image-button')
  if (mediaImageButton !== null) {
    window.godotLibrary.media.openLightbox(mediaImageButton)
    return
  }

  if (target.closest('[data-media-prev]') !== null) {
    window.godotLibrary.media.previous()
  } else if (target.closest('[data-media-next]') !== null) {
    window.godotLibrary.media.next()
  } else if (target.closest('[data-media-rail-prev]') !== null) {
    window.godotLibrary.media.scrollRail(-1)
  } else if (target.closest('[data-media-rail-next]') !== null) {
    window.godotLibrary.media.scrollRail(1)
  } else if (target.closest('[data-media-lightbox-close]') !== null) {
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

  // Theme selector in the header: System / Light / Dark (client-only).
  const themeOption = target.closest('[data-theme]')
  if (themeOption !== null) {
    const value = themeOption.getAttribute('data-theme')
    if (value !== null) window.godotLibrary.theme.set(value)
    const dropdown = themeOption.closest('.dropdown')
    if (dropdown !== null) window.godotLibrary.dropdown.close(dropdown)
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
  } else if (event.key === 'Home') {
    const indices = window.godotLibrary.media.getImageIndices()
    if (indices.length > 0) window.godotLibrary.media.showLightboxImage(indices[0])
  } else if (event.key === 'End') {
    const indices = window.godotLibrary.media.getImageIndices()
    if (indices.length > 0) window.godotLibrary.media.showLightboxImage(indices[indices.length - 1])
  }
})

// Main-viewer keyboard navigation: arrows move through the gallery when the
// focus is inside the player (not the lightbox) and not in a form control.
document.addEventListener('keydown', function (event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  const lightbox = window.godotLibrary.media.getLightbox()
  if (lightbox !== null && lightbox.classList.contains('active')) return
  const target = event.target
  if (!(target instanceof Element) || target.closest('.player') === null) return
  if (target.matches('input, textarea, select') || target.isContentEditable) return
  event.preventDefault()
  window.godotLibrary.media.move(event.key === 'ArrowLeft' ? -1 : 1)
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
  if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.matches('.media-image-button')) {
    event.preventDefault()
    window.godotLibrary.media.openLightbox(event.target)
  }
})

document.addEventListener('error', function (event) {
  const image = event.target
  if (!(image instanceof HTMLImageElement)) return

  // Terminal state: the fallback chain already landed on the local
  // placeholder. Never touch this image again — otherwise a still-active
  // srcset (or repeated fallback errors) can cause an unbounded retry loop.
  if (image.dataset.triedFallback === 'complete') return

  const source = image.getAttribute('src') ?? ''
  const host = image.dataset.host
  const fallback = image.dataset.fallbackImage

  // A failed responsive/lazy candidate keeps winning over `src` while its
  // srcset (or lazysizes hooks) is present. Disable the whole responsive
  // pipeline BEFORE assigning a fallback so the browser cannot re-select the
  // broken URL and lazysizes cannot re-install it.
  image.removeAttribute('srcset')
  image.removeAttribute('data-srcset')
  image.removeAttribute('sizes')
  image.removeAttribute('data-sizes')
  image.removeAttribute('data-src')
  image.classList.remove('lazyload')

  // Second failure: the original/host fallback also failed. Land on the
  // local placeholder permanently.
  if (image.dataset.triedFallback === 'true') {
    image.dataset.triedFallback = 'complete'
    image.src = '/images/noimage.png'
    return
  }

  // Relative README images are corrected against their repo host once.
  if (host !== undefined && source !== '' && !/^(https?:|data:|\/)/i.test(source)) {
    image.dataset.triedFallback = 'true'
    image.src = `${host}${source}`
    return
  }

  if (fallback !== undefined && fallback !== '') {
    if (new URL(fallback, document.baseURI).href === new URL(source, document.baseURI).href) {
      // The fallback is the same URL that just failed — do not retry it.
      image.dataset.triedFallback = 'complete'
      image.src = '/images/noimage.png'
      return
    }
    image.dataset.triedFallback = 'true'
    image.src = fallback
    return
  }

  image.dataset.triedFallback = 'complete'
  image.src = '/images/noimage.png'
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
  window.godotLibrary.theme.init()
  window.godotLibrary.media.init()
  window.godotLibrary.heroCarousel.initAll()
  window.godotLibrary.featuredAssets.syncButtons()

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
