/**
 * [INPUT]: 依赖当前 transaction_id、同源 enterprise 认证 API、RuoYi /auth/code 与 login.html DOM。
 * [OUTPUT]: 提供身份源加载、LOCAL 一次性验证码、跨身份源凭据清理、CSRF 提交和 OIDC 浏览器导航。
 * [POS]: T05 公开认证页面控制器，所有状态仅驻留当前页面内存且永不读取平台 Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const params = new URLSearchParams(window.location.search)
const transactionId = params.get('transaction_id')
const sourceList = document.querySelector('#source-list')
const passwordForm = document.querySelector('#password-form')
const selectedSource = document.querySelector('#selected-source')
const panelTitle = document.querySelector('#panel-title')
const status = document.querySelector('#status')
const captchaGroup = document.querySelector('#captcha-group')
const captchaId = document.querySelector('#captcha-id')
const captchaCode = document.querySelector('#captcha-code')
const captchaImage = document.querySelector('#captcha-image')
const username = document.querySelector('#username')
const password = document.querySelector('#password')

let csrfToken = null
let currentSource = null

function fail() {
  status.textContent = '登录失败，请重试。'
}

function showSources() {
  currentSource = null
  passwordForm.hidden = true
  sourceList.hidden = false
  username.value = ''
  password.value = ''
  hideCaptcha()
  panelTitle.textContent = '选择身份源'
  status.textContent = ''
}

function hideCaptcha() {
  captchaGroup.hidden = true
  captchaId.value = ''
  captchaCode.value = ''
  captchaCode.required = false
  captchaImage.removeAttribute('src')
}

async function refreshCaptcha() {
  try {
    const response = await fetch('/auth/code', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error('captcha unavailable')
    const payload = await response.json()
    const captcha = payload.data
    if (!captcha?.captchaEnabled) {
      hideCaptcha()
      return
    }
    captchaId.value = captcha.uuid
    captchaCode.value = ''
    captchaCode.required = true
    captchaImage.src = `data:image/gif;base64,${captcha.img}`
    captchaGroup.hidden = false
  } catch {
    hideCaptcha()
    fail()
  }
}

async function chooseSource(source) {
  status.textContent = ''
  if (source.type === 'OIDC') {
    window.location.assign(
      `/enterprise/auth/v1/oidc/${encodeURIComponent(source.id)}/start?transaction_id=${encodeURIComponent(transactionId)}`,
    )
    return
  }
  currentSource = source
  document.querySelector('#transaction-id').value = transactionId
  document.querySelector('#source-id').value = source.id
  document.querySelector('#csrf-token').value = csrfToken
  sourceList.hidden = true
  passwordForm.hidden = false
  panelTitle.textContent = '输入企业账号'
  selectedSource.textContent = source.name
  if (source.type === 'LOCAL') {
    await refreshCaptcha()
  } else {
    hideCaptcha()
  }
  username.focus()
}

async function loadSources() {
  if (!transactionId) {
    fail()
    return
  }
  try {
    const response = await fetch(
      `/enterprise/auth/v1/sources?transaction_id=${encodeURIComponent(transactionId)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!response.ok) throw new Error('sources unavailable')
    const payload = await response.json()
    csrfToken = payload.data.csrfToken
    for (const source of payload.data.sources) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'source-button'
      const name = document.createElement('span')
      name.textContent = source.name
      const type = document.createElement('span')
      type.className = 'source-type'
      type.textContent = source.type
      button.append(name, type)
      button.addEventListener('click', () => void chooseSource(source))
      sourceList.append(button)
    }
  } catch {
    fail()
  }
}

document.querySelector('#back-button').addEventListener('click', showSources)
document.querySelector('#captcha-refresh').addEventListener('click', () => void refreshCaptcha())

loadSources()
