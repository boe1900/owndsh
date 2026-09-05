/**
 * [INPUT]: 依赖 transaction/source/login_error 查询、enterprise 两阶段认证 API、宿主验证码与含密码源 Tab/OIDC 区域的 login DOM。
 * [OUTPUT]: 提供密码身份源 Tab 切换、默认源选择、页面内凭据认证、一次性 challenge 改密、错误留页、凭据清理和 OIDC 导航。
 * [POS]: 公开认证页面控制器，以既有 chooseSource 状态机承载 Tab，初始凭据提交后立即清空且第二步只持有短时 challenge 与新密码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const params = new URLSearchParams(window.location.search)
const transactionId = params.get('transaction_id')
const requestedSourceId = params.get('source_id')
const loginFailed = params.get('login_error') === '1'
const sourceList = document.querySelector('#source-list')
const oidcList = document.querySelector('#oidc-list')
const passwordForm = document.querySelector('#password-form')
const panelTitle = document.querySelector('#panel-title')
const status = document.querySelector('#status')
const captchaGroup = document.querySelector('#captcha-group')
const captchaId = document.querySelector('#captcha-id')
const captchaCode = document.querySelector('#captcha-code')
const captchaImage = document.querySelector('#captcha-image')
const credentialFields = document.querySelector('#credential-fields')
const username = document.querySelector('#username')
const password = document.querySelector('#password')
const passwordChangeChallenge = document.querySelector('#password-change-challenge')
const passwordChangeFields = document.querySelector('#password-change-fields')
const newPassword = document.querySelector('#new-password')
const confirmPassword = document.querySelector('#confirm-password')
const submitButton = document.querySelector('#submit-button')

let csrfToken = null

function fail() {
  status.textContent = '登录失败，请重试。'
}

function hidePasswordChange() {
  passwordChangeFields.hidden = true
  newPassword.value = ''
  confirmPassword.value = ''
  newPassword.required = false
  confirmPassword.required = false
}

function resetPasswordChange() {
  passwordChangeChallenge.value = ''
  passwordChangeChallenge.disabled = true
  credentialFields.hidden = false
  credentialFields.disabled = false
  username.required = true
  password.required = true
  submitButton.textContent = '登录'
  hidePasswordChange()
  sourceList.hidden = sourceList.childElementCount < 2
  oidcList.hidden = false
}

function showPasswordChange(challenge, rejected) {
  passwordChangeChallenge.value = challenge
  passwordChangeChallenge.disabled = false
  credentialFields.hidden = true
  credentialFields.disabled = true
  username.required = false
  password.required = false
  username.value = ''
  password.value = ''
  hideCaptcha()
  sourceList.hidden = true
  oidcList.hidden = true
  passwordChangeFields.hidden = false
  newPassword.required = true
  confirmPassword.required = true
  panelTitle.textContent = '设置新密码'
  submitButton.textContent = '修改密码并登录'
  status.textContent = rejected
    ? '新密码不符合安全要求，请重新输入。'
    : '首次登录必须先修改初始密码。'
  newPassword.value = ''
  confirmPassword.value = ''
  newPassword.focus()
}

function hideCaptcha() {
  captchaGroup.hidden = true
  captchaId.value = ''
  captchaCode.value = ''
  captchaCode.required = false
  captchaId.disabled = true
  captchaCode.disabled = true
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
    captchaId.disabled = false
    captchaCode.value = ''
    captchaCode.required = true
    captchaCode.disabled = false
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
  document.querySelector('#transaction-id').value = transactionId
  document.querySelector('#source-id').value = source.id
  document.querySelector('#csrf-token').value = csrfToken
  passwordForm.hidden = false
  panelTitle.textContent = '输入企业账号'
  for (const tab of sourceList.children) {
    const active = tab.dataset.sourceId === String(source.id)
    tab.setAttribute('aria-pressed', String(active))
  }
  resetPasswordChange()
  if (source.type === 'LOCAL') {
    await refreshCaptcha()
  } else {
    hidePasswordChange()
    hideCaptcha()
  }
  if (loginFailed) status.textContent = '账号、密码或验证码不正确，请重试。'
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
    const passwordSources = []
    let requestedSource = null
    for (const source of payload.data.sources) {
      const button = document.createElement('button')
      button.type = 'button'
      const name = document.createElement('span')
      if (source.type === 'OIDC') {
        button.className = 'oidc-button'
        name.textContent = `使用 ${source.name} 登录`
        button.append(name)
        oidcList.append(button)
      } else {
        passwordSources.push(source)
        button.className = 'source-button'
        button.dataset.sourceId = String(source.id)
        button.setAttribute('aria-pressed', 'false')
        name.textContent = source.name
        button.append(name)
        sourceList.append(button)
      }
      button.addEventListener('click', () => void chooseSource(source))
      const retryPassword = loginFailed && source.type !== 'OIDC'
      if (retryPassword && String(source.id) === requestedSourceId) {
        requestedSource = source
      }
    }
    if (oidcList.childElementCount > 0 && passwordSources.length > 0) {
      const divider = document.createElement('div')
      divider.className = 'oidc-divider'
      divider.textContent = '其他登录方式'
      oidcList.prepend(divider)
    }
    const initialSource = requestedSource ?? passwordSources[0]
    if (initialSource) await chooseSource(initialSource)
  } catch {
    fail()
  }
}

document.querySelector('#captcha-refresh').addEventListener('click', () => void refreshCaptcha())
passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!passwordChangeFields.hidden) {
    const candidate = newPassword.value
    const hasLower = /[a-z]/.test(candidate)
    const hasUpper = /[A-Z]/.test(candidate)
    const hasDigit = /[0-9]/.test(candidate)
    const hasSymbol = /[^A-Za-z0-9]/.test(candidate)
    if (candidate !== confirmPassword.value || candidate.length < 14 || !hasLower || !hasUpper || !hasDigit || !hasSymbol) {
      status.textContent = candidate !== confirmPassword.value
        ? '两次输入的新密码不一致。'
        : '新密码不符合安全要求。'
      return
    }
  }

  submitButton.disabled = true
  status.textContent = ''
  try {
    const response = await fetch(passwordForm.action, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new FormData(passwordForm),
    })
    const payload = await response.json()
    const step = payload.data
    if (response.status === 409 && step?.next === 'CHANGE_PASSWORD') {
      showPasswordChange(step.passwordChangeChallenge, step.rejected)
      return
    }
    if (response.ok && step?.next === 'REDIRECT' && step.redirectUri) {
      window.location.assign(step.redirectUri)
      return
    }
    if (payload.error?.code === 'ENT_AUTH_REQUIRED') {
      status.textContent = '账号、密码或验证码不正确，请重试。'
      if (passwordChangeChallenge.disabled) {
        password.value = ''
        await refreshCaptcha()
      }
      return
    }
    if (payload.error?.code === 'ENT_AUTH_SESSION_EXPIRED') {
      status.textContent = '登录已过期，请返回 Harness 重新登录。'
      return
    }
    fail()
  } catch {
    fail()
  } finally {
    submitButton.disabled = false
  }
})

loadSources()
