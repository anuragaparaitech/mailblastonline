/**
 * Aparaitech Software - Employee & Recruiter Management View (Admin Only)
 * Enforces strictly 50 Maximum Employees with full Data & SMTP Isolation
 */
const EmployeesView = {
  state: {
    users: [],
    maxEmployees: 50,
    activeEmployees: 0,
    remainingSlots: 50,
    searchTerm: ''
  },

  async render(container) {
    container.innerHTML = `
      <div class="view-loading">
        <div class="spinner"></div>
        <p>Loading Employee &amp; Recruiter Directory...</p>
      </div>
    `;

    try {
      const data = await api.getUsers();
      this.state.users = data.users || [];
      this.state.maxEmployees = data.maxEmployees || 50;
      this.state.activeEmployees = data.activeEmployees || 0;
      this.state.remainingSlots = data.remainingSlots !== undefined ? data.remainingSlots : Math.max(0, 50 - this.state.activeEmployees);

      this.renderUI(container);
    } catch (err) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 48px;">
          <h3 style="color: var(--color-danger);">Failed to load employee directory</h3>
          <p style="color: var(--text-muted);">${err.message}</p>
          <button class="btn btn-primary btn-sm" onclick="EmployeesView.render(document.getElementById('viewContainer'))">Retry</button>
        </div>
      `;
    }
  },

  renderUI(container) {
    const isAtLimit = this.state.activeEmployees >= this.state.maxEmployees;
    const capacityPercent = Math.min(100, Math.round((this.state.activeEmployees / this.state.maxEmployees) * 100));

    const filteredUsers = this.state.users.filter(u => {
      if (!this.state.searchTerm) return true;
      const term = this.state.searchTerm.toLowerCase();
      return (
        (u.name && u.name.toLowerCase().includes(term)) ||
        (u.email && u.email.toLowerCase().includes(term)) ||
        (u.department && u.department.toLowerCase().includes(term)) ||
        (u.role && u.role.toLowerCase().includes(term))
      );
    });

    container.innerHTML = `
      <div class="view-header">
        <div class="view-title-group">
          <h1>Employee &amp; Recruiter Management</h1>
          <p>Manage recruitment team members &bull; Separate SMTP credentials &amp; isolated candidate data &bull; <strong>Strict 50 Employee Maximum</strong></p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary btn-sm" onclick="EmployeesView.openAddEmployeeModal()" ${isAtLimit ? 'disabled title="Max limit of 50 employees reached"' : ''}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>+ Add New Employee</span>
          </button>
        </div>
      </div>

      <!-- Capacity & Quota Tracker Card -->
      <div class="card" style="margin-bottom: 24px; background: linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%); border: 1.5px solid #cbd5e1;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 14px;">
          <div>
            <h3 style="margin: 0; font-size: 1.15rem; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <span>👥 Employee Capacity &amp; License Limit</span>
              <span class="badge ${isAtLimit ? 'badge-danger' : 'badge-success'}" style="font-size: 0.76rem; padding: 3px 10px;">
                ${isAtLimit ? 'Capacity Full (50/50)' : `${this.state.remainingSlots} Slots Available`}
              </span>
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 0.84rem; color: #475569;">
              Each employee account receives their own isolated Candidate Student Pool, private SMTP Mailbox &amp; Password, and independent Campaign Cockpit.
            </p>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 1.5rem; font-weight: 800; color: #1e293b;">
              ${this.state.activeEmployees} <span style="font-size: 1rem; color: #64748b; font-weight: 500;">/ ${this.state.maxEmployees} Max</span>
            </span>
          </div>
        </div>

        <!-- Progress Bar -->
        <div style="background: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 12px;">
          <div style="width: ${capacityPercent}%; height: 100%; background: ${isAtLimit ? '#ef4444' : capacityPercent > 80 ? '#f59e0b' : 'linear-gradient(90deg, #2563eb, #38bdf8)'}; transition: width 0.4s ease; border-radius: 6px;"></div>
        </div>

        ${isAtLimit ? `
          <div style="background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">
            <span>⚠️</span>
            <span><strong>Maximum employee limit (50) reached!</strong> You cannot add additional employees. To register a new employee, please deactivate or delete an inactive account below.</span>
          </div>
        ` : ''}
      </div>

      <!-- Quick Metrics Grid -->
      <div class="metrics-grid" style="margin-bottom: 24px;">
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">Active Employees</span>
            <div class="metric-icon" style="background: #eff6ff; color: #2563eb;">👥</div>
          </div>
          <div class="metric-value">${this.state.activeEmployees}</div>
          <div class="metric-footer" style="color: #64748b;">Out of ${this.state.maxEmployees} maximum</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">Remaining Slots</span>
            <div class="metric-icon" style="background: #ecfdf5; color: #10b981;">🎟️</div>
          </div>
          <div class="metric-value" style="color: ${this.state.remainingSlots > 0 ? '#10b981' : '#ef4444'};">${this.state.remainingSlots}</div>
          <div class="metric-footer" style="color: #64748b;">Available to assign</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">Total Candidates Pooled</span>
            <div class="metric-icon" style="background: #f5f3ff; color: #8b5cf6;">🎓</div>
          </div>
          <div class="metric-value">${this.state.users.reduce((acc, u) => acc + (u.student_count || 0), 0)}</div>
          <div class="metric-footer" style="color: #64748b;">Across all employee pools</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">Configured SMTP Senders</span>
            <div class="metric-icon" style="background: #fffbeb; color: #d97706;">📧</div>
          </div>
          <div class="metric-value">${this.state.users.reduce((acc, u) => acc + (u.smtp_count || 0), 0)}</div>
          <div class="metric-footer" style="color: #64748b;">Active sender accounts</div>
        </div>
      </div>

      <!-- Employees Directory Table Card -->
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 class="card-title">Recruitment Staff Directory (${filteredUsers.length})</h3>
            <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
              Click <strong>"Switch View"</strong> on any employee to instantly log into their dashboard and view their data
            </p>
          </div>
          <div>
            <input 
              type="text" 
              class="form-input" 
              style="width: 260px; font-size: 0.84rem; padding: 6px 12px;" 
              placeholder="🔍 Search staff by name/email..." 
              value="${this.state.searchTerm}" 
              oninput="EmployeesView.state.searchTerm = this.value; EmployeesView.renderUI(document.getElementById('viewContainer'))" 
            />
          </div>
        </div>

        <div class="table-container" style="overflow-x: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Employee / Recruiter</th>
                <th>Role</th>
                <th>Department</th>
                <th>Candidates</th>
                <th>Campaigns</th>
                <th>SMTP Senders</th>
                <th>Status</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filteredUsers.map(u => `
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="width: 34px; height: 34px; border-radius: 50%; background: ${u.role === 'admin' ? '#1e3a8a' : '#0284c7'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem;">
                        ${u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">
                          ${u.name} ${u.id === 1 ? '<span style="font-size: 0.72rem; color: #2563eb; background: #dbeafe; padding: 1px 6px; border-radius: 4px; font-weight: 700;">Admin</span>' : ''}
                        </div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); font-family: var(--font-mono);">${u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="badge ${u.role === 'admin' ? 'badge-primary' : 'badge-secondary'}" style="text-transform: capitalize;">
                      ${u.role}
                    </span>
                  </td>
                  <td style="font-size: 0.85rem; color: #475569;">
                    ${u.department || 'Campus Recruitment'}
                  </td>
                  <td>
                    <span style="font-weight: 700; color: #0284c7;">${u.student_count || 0}</span>
                    <span style="font-size: 0.76rem; color: #64748b;"> students</span>
                  </td>
                  <td>
                    <span style="font-weight: 700; color: #4f46e5;">${u.campaign_count || 0}</span>
                    <span style="font-size: 0.76rem; color: #64748b;"> blasts</span>
                  </td>
                  <td>
                    <span style="font-weight: 700; color: #059696;">${u.smtp_count || 0}</span>
                    <span style="font-size: 0.76rem; color: #64748b;"> accounts</span>
                  </td>
                  <td>
                    <span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">
                      ${u.status === 'active' ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  <td style="text-align: right; white-space: nowrap;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end;">
                      <button class="btn btn-outline btn-sm" style="font-size: 0.75rem; padding: 4px 8px;" onclick="EmployeesView.switchToUser(${u.id})" title="Log in as this employee to view their private student list and SMTP configuration">
                        👤 Switch
                      </button>
                      <button class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 4px 8px;" onclick="EmployeesView.openEditEmployeeModal(${u.id})" title="Edit employee details">
                        ✏️ Edit
                      </button>
                      ${u.id !== 1 ? `
                        <button class="btn btn-danger btn-sm" style="font-size: 0.75rem; padding: 4px 8px;" onclick="EmployeesView.deleteEmployee(${u.id}, '${u.name.replace(/'/g, "\\'")}')" title="Delete employee and free up capacity slot">
                          🗑️
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  openAddEmployeeModal() {
    if (this.state.activeEmployees >= this.state.maxEmployees) {
      app.showToast(`Cannot add employee: 50/50 maximum capacity reached. Please deactivate or remove an employee first.`, 'error', 'Capacity Reached');
      return;
    }

    const modalHtml = `
      <div class="modal-header">
        <h3 class="modal-title">Add New Recruitment Employee (${this.state.activeEmployees + 1} / ${this.state.maxEmployees})</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size: 0.84rem; color: var(--text-muted); margin-bottom: 16px;">
          Adding an employee allocates a separate private space for their students, independent Gmail / SMTP accounts, and campaign history.
        </p>

        <form id="addEmployeeForm" onsubmit="EmployeesView.submitAddEmployee(event)">
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" name="name" class="form-input" required placeholder="e.g. Shruti Kulkarni" />
          </div>

          <div class="form-group">
            <label class="form-label">Email Address (Login Username) *</label>
            <input type="email" name="email" class="form-input" required placeholder="e.g. shruti.emp@aparaitech.org" />
          </div>

          <div class="form-group">
            <label class="form-label">Password *</label>
            <input type="password" name="password" class="form-input" required placeholder="Enter login password" value="emp123" />
            <small style="color: var(--text-muted); font-size: 0.74rem;">Default: emp123 (can be changed anytime)</small>
          </div>

          <div class="form-group">
            <label class="form-label">Department / Branch</label>
            <input type="text" name="department" class="form-input" value="Campus Recruitment" placeholder="e.g. Tech Hiring, Campus Outreach" />
          </div>

          <div class="form-group">
            <label class="form-label">Role</label>
            <select name="role" class="form-select">
              <option value="employee" selected>Employee (Personal Data &amp; Private SMTP)</option>
              <option value="admin">Administrator (Full System Access)</option>
            </select>
          </div>

          <div class="modal-actions" style="margin-top: 24px;">
            <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btnSubmitEmployee">Create Employee Account</button>
          </div>
        </form>
      </div>
    `;

    app.openModal(modalHtml);
  },

  async submitAddEmployee(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = document.getElementById('btnSubmitEmployee');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        password: form.password.value.trim(),
        department: form.department.value.trim(),
        role: form.role.value
      };

      const res = await api.createEmployee(payload);
      app.closeModal();
      app.showToast(res.message || 'Employee created successfully!', 'success', 'Staff Added');
      await this.render(document.getElementById('viewContainer'));
      await app.refreshCounters();
    } catch (err) {
      if (submitBtn) submitBtn.disabled = false;
      app.showToast(err.message, 'error', 'Error Adding Staff');
    }
  },

  openEditEmployeeModal(userId) {
    const user = this.state.users.find(u => u.id === userId);
    if (!user) return;

    const modalHtml = `
      <div class="modal-header">
        <h3 class="modal-title">Edit Employee: ${user.name}</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <form id="editEmployeeForm" onsubmit="EmployeesView.submitEditEmployee(event, ${user.id})">
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" name="name" class="form-input" required value="${user.name}" />
          </div>

          <div class="form-group">
            <label class="form-label">Email Address *</label>
            <input type="email" name="email" class="form-input" required value="${user.email}" />
          </div>

          <div class="form-group">
            <label class="form-label">New Password (leave blank to keep current)</label>
            <input type="password" name="password" class="form-input" placeholder="••••••••" />
          </div>

          <div class="form-group">
            <label class="form-label">Department / Branch</label>
            <input type="text" name="department" class="form-input" value="${user.department || ''}" />
          </div>

          <div class="form-group">
            <label class="form-label">Account Status</label>
            <select name="status" class="form-select">
              <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active (Consumes 1 slot)</option>
              <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactive (Deactivated)</option>
            </select>
          </div>

          <div class="modal-actions" style="margin-top: 24px;">
            <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btnSaveEmployee">Save Changes</button>
          </div>
        </form>
      </div>
    `;

    app.openModal(modalHtml);
  },

  async submitEditEmployee(event, userId) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = document.getElementById('btnSaveEmployee');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        department: form.department.value.trim(),
        status: form.status.value
      };

      if (form.password.value && form.password.value.trim()) {
        payload.password = form.password.value.trim();
      }

      const res = await api.updateEmployee(userId, payload);
      app.closeModal();
      app.showToast(res.message || 'Employee updated successfully!', 'success', 'Saved');
      await this.render(document.getElementById('viewContainer'));
      await app.refreshCounters();
    } catch (err) {
      if (submitBtn) submitBtn.disabled = false;
      app.showToast(err.message, 'error', 'Error Updating Staff');
    }
  },

  async deleteEmployee(userId, name) {
    if (!confirm(`Are you sure you want to remove employee "${name}"? This will free up 1 slot in your 50-employee quota.`)) {
      return;
    }

    try {
      const res = await api.deleteEmployee(userId);
      app.showToast(res.message, 'success', 'Staff Removed');
      await this.render(document.getElementById('viewContainer'));
      await app.refreshCounters();
    } catch (err) {
      app.showToast(err.message, 'error', 'Delete Failed');
    }
  },

  async switchToUser(userId) {
    const user = this.state.users.find(u => u.id === userId);
    if (!user) return;

    api.setCurrentUser(user);
    app.showToast(`Switched active session to: ${user.name} (${user.role.toUpperCase()})`, 'success', 'Account Switched');
    
    // Refresh header and reload current view
    await app.refreshUserHeader();
    app.navigate('dashboard');
  }
};
