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
    if (modal.querySelector('.body').contains(event.target)) {
      inModal = true
      break
    }
  }

  if (!inModal) {
    closeAllModals()
  }

  if (event.target.getAttribute('name') !== 'query') {
    document.querySelector('.search').classList.remove('active')
  }
})

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

window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img').forEach(image => {
    image.addEventListener('error', function (e) {
      e.target.src = '/images/noimage.png'
    })
  })
})
