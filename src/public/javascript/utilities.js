/* eslint-disable no-undef */
/**
 * Add PageMessage work to window object
 *
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
          location.reload()
        }
      })
      e.preventDefault()
    }
  }
}
