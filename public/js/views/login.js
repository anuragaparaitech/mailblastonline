/**
 * Aparaitech Software - First Login Page View
 * Dedicated authentication portal for Admin and Employees
 * Ensures complete data segregation and independent blasting with distinct SMTP accounts
 */
const LoginView = {
  render(container) {
    container.innerHTML = `
      <div class="login-screen" id="loginScreenView">
        <div class="login-card">
          <!-- Company Brand Header -->
          <div class="login-brand-header">
            <div class="login-brand-logo">
              <svg viewBox="0 0 40 40" width="48" height="48">
                <rect width="40" height="40" rx="10" fill="#2563eb"/>
                <path d="M20 8 L32 16 L32 28 L20 34 L8 28 L8 16 Z" fill="none" stroke="#93c5fd" stroke-width="1.5" opacity="0.6"/>
                <path d="M20 12 L28 28 L24 28 L22 23 L18 23 L16 28 L12 28 Z" fill="#ffffff"/>
                <path d="M19 20 L21 20 L20 16 Z" fill="#2563eb"/>
                <circle cx="20" cy="8" r="2.5" fill="#38bdf8"/>
                <circle cx="32" cy="16" r="2.5" fill="#38bdf8"/>
                <circle cx="32" cy="28" r="2.5" fill="#38bdf8"/>
                <circle cx="20" cy="34" r="2.5" fill="#38bdf8"/>
                <circle cx="8" cy="28" r="2.5" fill="#38bdf8"/>
                <circle cx="8" cy="16" r="2.5" fill="#38bdf8"/>
              </svg>
            </div>
            <h1 class="login-title">APARAI<span>TECH</span> SOFTWARE</h1>
            <p class="login-subtitle">Campus Placement &amp; Student Email Blast Portal</p>
          </div>

          <div id="loginAlertBox" style="display: none;" class="login-alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span id="loginAlertMsg">Invalid credentials</span>
          </div>

          <!-- Login Form -->
          <form class="login-form" id="mainLoginForm" onsubmit="LoginView.handleLogin(event)">
            <div class="form-group">
              <label class="form-label" for="loginEmailInput">Corporate Email ID</label>
              <input 
                type="email" 
                id="loginEmailInput" 
                class="login-input" 
                placeholder="e.g. anurag.emp@aparaitech.org" 
                autocomplete="username" 
                required 
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="loginPasswordInput">Password / Access Key</label>
              <input 
                type="password" 
                id="loginPasswordInput" 
                class="login-input" 
                placeholder="••••••••" 
                autocomplete="current-password" 
                required 
              />
            </div>

            <button type="submit" id="loginSubmitBtn" class="login-submit-btn">
              <span>Sign In to Workspace &rarr;</span>
            </button>
          </form>

          <!-- Quick 1-Click Demo Accounts -->
          <div class="demo-logins-box">
            <div class="demo-logins-title">
              <span>Quick 1-Click Access</span>
              <span style="font-size: 0.68rem; color: #60a5fa; font-weight: normal;">Click account to sign in</span>
            </div>
            <div class="demo-cards-grid">
              <div class="demo-account-pill" onclick="LoginView.fillAndSubmit('admin@aparaitech.org', 'admin123')">
                <div class="demo-account-role">👑 Admin Portal</div>
                <div class="demo-account-name">Aparaitech Admin</div>
              </div>
              <div class="demo-account-pill" onclick="LoginView.fillAndSubmit('anurag.emp@aparaitech.org', 'emp123')">
                <div class="demo-account-role">💼 Employee (Campus)</div>
                <div class="demo-account-name">Anurag K</div>
              </div>
              <div class="demo-account-pill" onclick="LoginView.fillAndSubmit('vivek.emp@aparaitech.org', 'emp123')">
                <div class="demo-account-role">💼 Employee (Engg)</div>
                <div class="demo-account-name">Vivek S</div>
              </div>
              <div class="demo-account-pill" onclick="LoginView.fillAndSubmit('kshitij.emp@aparaitech.org', 'emp123')">
                <div class="demo-account-role">💼 Employee (Univ)</div>
                <div class="demo-account-name">Kshitij M</div>
              </div>
            </div>
          </div>

          <!-- Data Isolation Guarantee -->
          <div class="login-footer-guarantee">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <div>
              <strong>Complete Data Segregation:</strong> Candidate students, SMTP senders, and blast queues are isolated strictly per employee.
            </div>
          </div>
        </div>
      </div>
    `;
  },

  fillAndSubmit(email, password) {
    const emailInput = document.getElementById('loginEmailInput');
    const passInput = document.getElementById('loginPasswordInput');
    if (emailInput && passInput) {
      emailInput.value = email;
      passInput.value = password;
      this.handleLogin();
    }
  },

  async handleLogin(event) {
    if (event) event.preventDefault();
    const email = document.getElementById('loginEmailInput')?.value?.trim();
    const password = document.getElementById('loginPasswordInput')?.value?.trim();
    const alertBox = document.getElementById('loginAlertBox');
    const alertMsg = document.getElementById('loginAlertMsg');
    const submitBtn = document.getElementById('loginSubmitBtn');

    if (!email || !password) {
      if (alertBox && alertMsg) {
        alertMsg.textContent = 'Please enter both corporate email and password.';
        alertBox.style.display = 'flex';
      }
      return;
    }

    if (alertBox) alertBox.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Verifying credentials...</span>';
    }

    try {
      const res = await api.login(email, password);
      if (res.user) {
        api.setCurrentUser(res.user);
        app.showToast(`Welcome back, ${res.user.name} (${res.user.role.toUpperCase()})`, 'success');
        app.onAuthenticated();
      } else {
        throw new Error(res.message || 'Login failed');
      }
    } catch (err) {
      if (alertBox && alertMsg) {
        alertMsg.textContent = err.message || 'Invalid credentials or inactive account.';
        alertBox.style.display = 'flex';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Sign In to Workspace &rarr;</span>';
      }
    }
  }
};
