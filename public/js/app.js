/**
 * Aparaitech Software - Single Page Application Core
 * Routing, View Management, Modals, and Notifications
 */
class App {
  constructor() {
    this.currentView = 'dashboard';
    this.viewContainer = null;
    this.views = {
      'dashboard': DashboardView,
      'students': StudentsView,
      'import': ImportView,
      'templates': TemplatesView,
      'composer': ComposerView,
      'blast-monitor': BlastMonitorView,
      'history': HistoryView,
      'employees': EmployeesView,
      'settings': SettingsView,
      'demo-tour': DemoTourView
    };
  }

  async init() {
    this.viewContainer = document.getElementById('viewContainer');

    // Handle hash change events
    window.addEventListener('hashchange', () => this.handleRoute());

    // Close modal on backdrop click or ESC key
    const modalOverlay = document.getElementById('modalContainer');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) this.closeModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });

    // Check if user is authenticated
    const user = api.getCurrentUser();
    if (!user) {
      this.showLoginScreen();
      return;
    }

    await this.showAppScreen();
  }

  showLoginScreen() {
    const loginContainer = document.getElementById('loginScreenContainer');
    const header = document.querySelector('.app-header');
    const layout = document.querySelector('.app-layout');

    if (header) header.style.display = 'none';
    if (layout) layout.style.display = 'none';

    if (loginContainer) {
      loginContainer.style.display = 'block';
      if (typeof LoginView !== 'undefined' && typeof LoginView.render === 'function') {
        LoginView.render(loginContainer);
      }
    }
  }

  async showAppScreen() {
    const loginContainer = document.getElementById('loginScreenContainer');
    const header = document.querySelector('.app-header');
    const layout = document.querySelector('.app-layout');

    if (loginContainer) {
      loginContainer.style.display = 'none';
      loginContainer.innerHTML = '';
    }

    if (header) header.style.display = 'flex';
    if (layout) layout.style.display = 'flex';

    this.updateUserUI();
    await this.refreshEnvironmentBadge();
    await this.refreshCounters();
    this.handleRoute();
  }

  onAuthenticated() {
    this.showAppScreen();
  }

  updateUserUI() {
    const user = api.getCurrentUser();
    const nameEl = document.getElementById('headerUserName');
    const roleEl = document.getElementById('headerUserRole');
    const avatarEl = document.getElementById('headerUserAvatar');
    if (nameEl) nameEl.textContent = user.name || 'User';
    if (roleEl) roleEl.textContent = (user.role || 'employee').toUpperCase();
    if (avatarEl) {
      avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();
      avatarEl.style.background = user.role === 'admin'
        ? 'linear-gradient(135deg, #2563eb, #38bdf8)'
        : 'linear-gradient(135deg, #059669, #34d399)';
    }

    // Role-based navigation badge styling
    const empNav = document.getElementById('nav-employees');
    const adminNavTitle = document.getElementById('adminNavTitle');
    if (empNav) {
      if (user.role === 'admin') {
        empNav.title = 'Staff & Capacity Management (Admin)';
        if (adminNavTitle) adminNavTitle.style.display = 'block';
      } else {
        empNav.title = 'Staff Roster & Capacity (View Only for Employees)';
      }
    }
  }

  async refreshEnvironmentBadge() {
    try {
      const data = await api.getSettings();
      const settings = data.settings || {};
      const badge = document.getElementById('envBadgeText');
      if (badge) {
        badge.textContent = 'Live SMTP';
      }
    } catch (err) {
      console.error('Settings badge error:', err);
    }
  }

  async refreshCounters() {
    try {
      const statsData = await api.getDashboardStats();
      const countEl = document.getElementById('navStudentCount');
      if (countEl && statsData.stats) {
        countEl.textContent = statsData.stats.totalStudents || 0;
      }

      // Templates count
      try {
        const tplData = await api.getTemplates();
        const tplCountEl = document.getElementById('navTemplateCount');
        if (tplCountEl && tplData.templates) {
          tplCountEl.textContent = tplData.templates.length;
        }
      } catch (e) {}

      // Employees capacity counter
      try {
        const empCountEl = document.getElementById('navEmployeeCount');
        if (empCountEl) {
          if (statsData.stats && statsData.stats.employeeCapacity) {
            empCountEl.textContent = `${statsData.stats.employeeCapacity.active}/${statsData.stats.employeeCapacity.max}`;
          } else {
            const usersData = await api.getUsers();
            const activeEmployees = (usersData.users || []).filter(u => u.role === 'employee' && u.status === 'active').length;
            empCountEl.textContent = `${activeEmployees}/50`;
          }
        }
      } catch (e) {}
    } catch (err) {
      console.error('Counter refresh error:', err);
    }
  }

  async openUserSwitchModal() {
    const currentUser = api.getCurrentUser();
    let usersList = [];
    try {
      const res = await api.getUsers();
      usersList = res.users || [];
    } catch (e) {
      usersList = [
        { id: 1, name: 'Aparaitech Admin', email: 'admin@aparaitech.org', role: 'admin', department: 'Executive Management' },
        { id: 2, name: 'Anurag Kashyap', email: 'anurag.emp@aparaitech.org', role: 'employee', department: 'Campus Recruitment' },
        { id: 3, name: 'Vivek Sharma', email: 'vivek.emp@aparaitech.org', role: 'employee', department: 'Engineering Hiring' },
        { id: 4, name: 'Kshitij Deshmukh', email: 'kshitij.emp@aparaitech.org', role: 'employee', department: 'University Relations' }
      ];
    }

    const escape = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

    const html = `
      <div class="modal-header">
        <div>
          <h3 class="modal-title">Switch User Account</h3>
          <p class="modal-subtitle">Current session: <strong>${escape(currentUser.name)}</strong> (${currentUser.role.toUpperCase()})</p>
        </div>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <div class="modal-body" style="padding: 20px 24px;">
        <div style="margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <label style="font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-light); margin: 0;">Quick Switch User (1-Click Switch)</label>
            <span style="font-size: 0.75rem; background: rgba(37,99,235,0.12); color: #2563eb; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Data Segregation Active</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; max-height: 250px; overflow-y: auto;">
            ${usersList.map(u => {
              const isCurrent = u.id === currentUser.id;
              const roleBg = u.role === 'admin' ? 'rgba(37,99,235,0.15)' : 'rgba(16,185,129,0.15)';
              const roleColor = u.role === 'admin' ? '#3b82f6' : '#10b981';
              return `
                <div onclick="app.switchUserAccount(${u.id}, '${escape(u.name)}', '${escape(u.email)}', '${u.role}', '${escape(u.department || '')}')"
                     style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 8px; border: 1px solid ${isCurrent ? 'var(--brand-sapphire)' : 'var(--border-light)'}; background: ${isCurrent ? 'rgba(37,99,235,0.06)' : 'var(--bg-surface)'}; cursor: pointer; transition: all 0.15s ease;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 34px; height: 34px; border-radius: 50%; background: ${u.role === 'admin' ? '#2563eb' : '#059669'}; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 0.85rem;">
                      ${(u.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${escape(u.name)} ${isCurrent ? '<span style="font-size: 0.72rem; color: #2563eb; font-weight: 700; margin-left: 6px;">● CURRENT</span>' : ''}</div>
                      <div style="font-size: 0.78rem; color: var(--text-secondary);">${escape(u.email)} &bull; ${escape(u.department || 'Staff')}</div>
                    </div>
                  </div>
                  <div>
                    <span style="background: ${roleBg}; color: ${roleColor}; font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">
                      ${u.role}
                    </span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="border-top: 1px solid var(--border-light); padding-top: 16px;">
          <h4 style="font-size: 0.88rem; font-weight: 600; margin-bottom: 8px; color: var(--text-primary);">Or Login with Credentials</h4>
          <form id="switchLoginForm" onsubmit="app.handleLoginFormSubmit(event)" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <input type="email" id="loginEmail" placeholder="Email (e.g. anurag.emp@aparaitech.org)" class="form-input" style="flex: 1; min-width: 180px; padding: 8px 12px; font-size: 0.85rem;" required />
            <input type="password" id="loginPass" placeholder="Password (emp123 or admin123)" class="form-input" style="width: 150px; padding: 8px 12px; font-size: 0.85rem;" required />
            <button type="submit" class="btn btn-primary btn-sm">Login &rarr;</button>
          </form>
        </div>
      </div>
      <div class="modal-footer" style="padding: 12px 24px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.75rem; color: var(--text-muted);">Capacity: Max 50 employees strictly enforced</span>
        <button class="btn btn-outline btn-sm" onclick="app.closeModal()">Close</button>
      </div>
    `;

    this.openModal(html);
  }

  switchUserAccount(id, name, email, role, department) {
    const user = { id, name, email, role, department };
    api.setCurrentUser(user);
    this.updateUserUI();
    this.closeModal();
    this.showToast(`Switched active session to ${name} (${role.toUpperCase()})`, 'success');
    this.refreshCounters();
    this.navigate(this.currentView, null, true);
  }

  async handleLoginFormSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPass')?.value?.trim();
    if (!email || !password) return;

    try {
      const res = await api.login(email, password);
      if (res.user) {
        api.setCurrentUser(res.user);
        this.updateUserUI();
        this.closeModal();
        this.showToast(`Successfully logged in as ${res.user.name} (${res.user.role.toUpperCase()})`, 'success');
        this.refreshCounters();
        this.navigate(this.currentView, null, true);
      }
    } catch (err) {
      this.showToast(err.message || 'Login failed', 'error');
    }
  }

  handleRoute() {
    if (!api.getCurrentUser()) {
      this.showLoginScreen();
      return;
    }
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const [viewName] = hash.split('?');
    const params = this.pendingParams || null;
    this.pendingParams = null;
    this.navigate(viewName, params, false);
  }

  navigate(viewName, params = null, updateHash = true) {
    if (!api.getCurrentUser()) {
      this.showLoginScreen();
      return;
    }

    if (!this.views[viewName]) {
      viewName = 'dashboard';
    }

    if (params) {
      this.pendingParams = params;
    }

    // Clean up previous view if needed
    if (this.views[this.currentView] && typeof this.views[this.currentView].destroy === 'function') {
      this.views[this.currentView].destroy();
    }

    this.currentView = viewName;

    if (updateHash) {
      if (window.location.hash === `#${viewName}`) {
        // Same hash, handle route manually
        const routeParams = this.pendingParams || params;
        this.pendingParams = null;
        this.renderView(viewName, routeParams);
        return;
      }
      window.location.hash = viewName;
      return;
    }

    this.renderView(viewName, params);
  }

  renderView(viewName, params) {
    // Update active nav class
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
      if (el.getAttribute('data-view') === viewName) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Scroll to top
    window.scrollTo(0, 0);

    // Render target view
    const viewObj = this.views[viewName];
    if (viewObj && typeof viewObj.render === 'function') {
      viewObj.render(this.viewContainer, params);
    }
  }

  openModal(htmlContent) {
    const overlay = document.getElementById('modalContainer');
    const card = document.getElementById('modalCard');
    if (overlay && card) {
      card.innerHTML = htmlContent;
      overlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  }

  closeModal() {
    const overlay = document.getElementById('modalContainer');
    if (overlay) {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  showToast(message, type = 'info', title = null) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const titles = {
      success: title || 'Success',
      error: title || 'Error',
      warning: title || 'Warning',
      info: title || 'Notice'
    };

    const icons = {
      success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>',
      error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
      warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
      info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };

    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-content">
        <div class="toast-title">${titles[type]}</div>
        <div class="toast-msg">${message}</div>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 250);
    }, 4500);
  }
}

// Global App Instance
const app = new App();

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
