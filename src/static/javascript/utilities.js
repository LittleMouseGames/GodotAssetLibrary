/* eslint-disable no-undef */
/**
 * We attach and namespace our utulity functions to avoid
 * collisions and create a predictable pattern for accessing
 * the methods that we need or want to use
 */
window.godotLibrary = {
  pageMessages: {
    addPageMessage: function (message) {
      const pageMessageContainer = document.querySelector('.page-message .messages')
      const messageNode = document.createElement('div')
      messageNode.innerText = message
      messageNode.classList.add('message')

      pageMessageContainer.appendChild(messageNode)
    },

    removeAllPageMessages: function () {
      // write empty HTML to page messages container
      document.querySelector('.page-message .messages').innerHTML = ''
    }
  },
  formTools: {
    sendFormAjax: function (e, form) {
      fetch(form.action, {
        method: 'post',
        body: new URLSearchParams(new FormData(form)),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }).then(response => {
        if (!response.ok) {
          response.json().then(data => {
            window.godotLibrary.pageMessages.removeAllPageMessages()
            window.godotLibrary.pageMessages.addPageMessage(data.error)
          })
        } else {
          window.godotLibrary.pageMessages.removeAllPageMessages()
          window.godotLibrary.pageMessages.addPageMessage('Success! Redirecting...')
          window.setTimeout(() => {
            location.reload()
          }, 2000)
        }
      })
      e.preventDefault()
    }
  },
  dropdown: {
    showContent: function (event, dropdown) {
      const dropdownElement = dropdown.querySelector('.options')

      if (dropdownElement !== null && (dropdownElement.style.display === 'none' || window.getComputedStyle(dropdownElement).display === 'none')) {
        closeAllDropdowns()
        dropdownElement.style.display = 'flex'
      } else {
        dropdownElement.style.display = 'none'
      }
    },
    callRouteAjax: function (event, route, message) {
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
        }
      })
    }
  },
  mobile: {
    showSearch (event) {
      document.querySelector('.search').classList.add('active')
      event.stopPropagation()
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
        image.src = imageUrl
        image.dataset.fallbackImage = imageUrl
        image.dataset.mediaUrl = imageUrl
        image.dataset.mediaIndex = index
        image.dataset.triedFallback = 'false'
      }
    },
    showLightboxImage: function (index) {
      const lightbox = this.getLightbox()
      const image = lightbox?.querySelector('[data-media-lightbox-image]')
      const button = document.querySelector(`.thumbnail-btn[data-media-index="${index}"]`)

      if (lightbox === null || image === null || button === null) return

      const url = button.getAttribute('data-media-image-url')
      if (url === null) return

      image.src = url
      image.dataset.fallbackImage = url
      image.dataset.triedFallback = 'false'
      image.alt = button.querySelector('img')?.alt ?? 'Asset preview image'
      lightbox.dataset.mediaIndex = index
    },
    openLightbox: function (trigger) {
      const lightbox = this.getLightbox()
      const image = lightbox?.querySelector('[data-media-lightbox-image]')
      const index = trigger.dataset.mediaIndex

      if (lightbox === null || image === null || index === undefined || index === '') return

      this.activeTrigger = trigger
      this.showLightboxImage(index)
      lightbox.classList.add('active')
      lightbox.setAttribute('aria-hidden', 'false')
      document.body.style.overflow = 'hidden'
      lightbox.querySelector('[data-media-lightbox-close]')?.focus()
    },
    closeLightbox: function () {
      const lightbox = this.getLightbox()
      if (lightbox === null) return

      lightbox.classList.remove('active')
      lightbox.setAttribute('aria-hidden', 'true')
      document.body.style.overflow = ''
      this.activeTrigger?.focus()
      this.activeTrigger = null
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

  if (event.target.getAttribute?.('name') !== 'query') {
    document.querySelector('.search')?.classList.remove('active')
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

document.addEventListener('keydown', function (event) {
  const lightbox = window.godotLibrary.media.getLightbox()
  if (lightbox === null || !lightbox.classList.contains('active')) return

  if (event.key === 'Escape') {
    window.godotLibrary.media.closeLightbox()
  } else if (event.key === 'ArrowLeft') {
    window.godotLibrary.media.moveLightbox(-1)
  } else if (event.key === 'ArrowRight') {
    window.godotLibrary.media.moveLightbox(1)
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
    image.src = fallback
  } else {
    image.src = '/images/noimage.png'
  }
}, true)

function isHidden (el) {
  const style = window.getComputedStyle(el)
  return (style.display === 'none')
}

function closeAllDropdowns () {
  document.querySelectorAll('.dropdown .options').forEach(element => {
    element.style.display = 'none'
  })
}

function closeAllModals () {
  document.querySelectorAll('.modal').forEach(element => {
    element.classList.remove('active')
  })
}

document.addEventListener('DOMContentLoaded', function (_event) {
  document.querySelectorAll('.accordion').forEach(accordion => {
    accordion.querySelector('.accordion-trigger').addEventListener('click', function (e) {
      const content = accordion.querySelector('.accordion-content')
      const openIcon = accordion.querySelector('.icon-close')
      const closeIcon = accordion.querySelector('.icon-expand')

      if (isHidden(content)) {
        content.style.display = 'block'
        openIcon.style.display = 'block'
        closeIcon.style.display = 'none'
      } else {
        content.style.display = 'none'
        openIcon.style.display = 'none'
        closeIcon.style.display = 'block'
      }
    })
  })
})
