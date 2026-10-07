/**
 * Aparaitech Software - Email Templates Management View
 * Allows Recruiters & Admin to create, edit, save, preview, and manage email templates
 */
const TemplatesView = {
  state: {
    templates: [],
    selectedCategory: 'all',
    searchTerm: '',
    editingTemplateId: null
  },

  async render(container) {
    container.innerHTML = `
      <div class="view-loading">
        <div class="spinner"></div>
        <p>Loading Recruitment Email Templates...</p>
      </div>
    `;

    try {
      const data = await api.getTemplates();
      this.state.templates = data.templates || [];
      this.renderUI(container);
    } catch (err) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 48px;">
          <h3 style="color: var(--color-danger);">Failed to load email templates</h3>
          <p style="color: var(--text-muted);">${err.message}</p>
          <button class="btn btn-primary btn-sm" onclick="TemplatesView.render(document.getElementById('viewContainer'))">Retry</button>
        </div>
      `;
    }
  },

  renderUI(container) {
    const categories = ['all', 'Placement Drive', 'Internship', 'Interview', 'Hackathon', 'Offer'];
    
    const filtered = this.state.templates.filter(t => {
      const matchesCat = this.state.selectedCategory === 'all' || t.category === this.state.selectedCategory;
      const term = this.state.searchTerm.toLowerCase();
      const matchesSearch = !term || (
        (t.name && t.name.toLowerCase().includes(term)) ||
        (t.subject && t.subject.toLowerCase().includes(term))
      );
      return matchesCat && matchesSearch;
    });

    container.innerHTML = `
      <div class="view-header">
        <div class="view-title-group">
          <h1>Recruitment Email Templates Studio</h1>
          <p>Create, customize, edit, and save email templates &bull; Dynamic tags personalizer</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary btn-sm" onclick="TemplatesView.openEditModal(null)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>+ Create New Template</span>
          </button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="card" style="margin-bottom: 24px; padding: 14px 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <span style="font-size: 0.82rem; font-weight: 600; color: #64748b; margin-right: 4px;">Category:</span>
            ${categories.map(c => `
              <button 
                class="btn btn-sm ${this.state.selectedCategory === c ? 'btn-primary' : 'btn-outline'}" 
                style="padding: 4px 12px; font-size: 0.8rem; border-radius: 20px;" 
                onclick="TemplatesView.state.selectedCategory = '${c}'; TemplatesView.renderUI(document.getElementById('viewContainer'))">
                ${c === 'all' ? 'All Categories' : c}
              </button>
            `).join('')}
          </div>
          <div>
            <input 
              type="text" 
              class="form-input" 
              style="width: 250px; font-size: 0.84rem; padding: 6px 12px;" 
              placeholder="🔍 Search templates..." 
              value="${this.state.searchTerm}" 
              oninput="TemplatesView.state.searchTerm = this.value; TemplatesView.renderUI(document.getElementById('viewContainer'))" 
            />
          </div>
        </div>
      </div>

      <!-- Templates Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px;">
        ${filtered.length === 0 ? `
          <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 48px;">
            <p style="color: var(--text-muted); font-size: 1rem; margin-bottom: 12px;">No email templates found matching your criteria.</p>
            <button class="btn btn-primary btn-sm" onclick="TemplatesView.openEditModal(null)">+ Create First Template</button>
          </div>
        ` : filtered.map(t => `
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; border: 1px solid var(--border-light); transition: transform 0.2s, box-shadow 0.2s;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 10px;">
                <span class="badge badge-primary" style="font-size: 0.74rem;">${t.category}</span>
                <span style="font-size: 0.74rem; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px;">
                  ${t.user_id ? (t.author_name ? `By ${t.author_name}` : 'Custom') : 'Global System'}
                </span>
              </div>

              <h3 style="font-size: 1.05rem; font-weight: 700; color: #0f172a; margin-bottom: 8px; line-height: 1.3;">
                ${t.name}
              </h3>

              <div style="background: #f8fafc; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #2563eb; margin-bottom: 12px;">
                <div style="font-size: 0.74rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 2px;">Subject:</div>
                <div style="font-size: 0.86rem; color: #1e293b; font-weight: 500; word-break: break-word;">${t.subject}</div>
              </div>

              <!-- Tags Used -->
              <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px;">
                ${(function() {
                  try {
                    const tags = JSON.parse(t.tags_used || '[]');
                    return tags.map(tag => `<span style="font-size: 0.7rem; background: #e0f2fe; color: #0369a1; padding: 1px 7px; border-radius: 12px; font-weight: 600;">${tag}</span>`).join('');
                  } catch(e) { return ''; }
                })()}
              </div>
            </div>

            <!-- Card Actions -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 10px;">
              <button class="btn btn-outline btn-sm" style="font-size: 0.8rem;" onclick="TemplatesView.useInComposer(${t.id})">
                🚀 Use in Blast
              </button>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-secondary btn-sm" style="font-size: 0.8rem; padding: 4px 10px;" onclick="TemplatesView.openEditModal(${t.id})" title="Edit template subject and body">
                  ✏️ Edit
                </button>
                <button class="btn btn-danger btn-sm" style="font-size: 0.8rem; padding: 4px 8px;" onclick="TemplatesView.deleteTemplate(${t.id}, '${t.name.replace(/'/g, "\\'")}')" title="Delete template">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  openEditModal(templateId = null) {
    this.state.editingTemplateId = templateId;
    let template = {
      name: '',
      category: 'Placement Drive',
      subject: 'Aparaitech Software Opportunity for {Name} from {College}',
      body_html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto;">
  <h2>Hello {Name},</h2>
  <p>We are excited to share a campus recruitment opportunity with you from <strong>{College}</strong>.</p>
  <p>Role: <strong>{Job_Role}</strong> | Package: <strong>{Package}</strong></p>
  <div style="text-align: center; margin: 24px 0;">
    <a href="{ApplyLink}" style="background: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Apply Now &rarr;</a>
  </div>
  <p>Best regards,<br>Aparaitech Software Recruitment Team</p>
</div>`
    };

    if (templateId) {
      const found = this.state.templates.find(t => t.id === templateId);
      if (found) template = { ...found };
    }

    const isEdit = !!templateId;

    const modalHtml = `
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? '✏️ Edit &amp; Save Template' : '➕ Create New Email Template'}</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <div class="modal-body" style="max-height: 80vh; overflow-y: auto;">
        <form id="templateEditForm" onsubmit="TemplatesView.submitSaveTemplate(event)">
          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="tplModalName">Template Name *</label>
              <input type="text" id="tplModalName" name="name" class="form-input" required value="${template.name}" placeholder="e.g. 2026 Campus Drive Round 1 Invitation" />
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="tplModalCategory">Category</label>
              <select id="tplModalCategory" name="category" class="form-select">
                <option value="Placement Drive" ${template.category === 'Placement Drive' ? 'selected' : ''}>Placement Drive</option>
                <option value="Internship" ${template.category === 'Internship' ? 'selected' : ''}>Internship</option>
                <option value="Interview" ${template.category === 'Interview' ? 'selected' : ''}>Interview</option>
                <option value="Hackathon" ${template.category === 'Hackathon' ? 'selected' : ''}>Hackathon</option>
                <option value="Offer" ${template.category === 'Offer' ? 'selected' : ''}>Offer</option>
              </select>
            </div>
          </div>

          <!-- Variable Pills -->
          <div style="background: #f8fafc; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 0.74rem; font-weight: 700; color: #475569;">Insert Dynamic Tag:</span>
            ${['{Name}', '{College}', '{Branch}', '{Batch}', '{ApplyLink}', '{Job_Role}', '{Package}', '{Drive_Date}', '{Company}'].map(tag => `
              <button type="button" class="btn btn-outline btn-sm" style="font-size: 0.72rem; padding: 2px 7px; background: white;" onclick="TemplatesView.insertTagIntoForm('${tag}')">
                ${tag}
              </button>
            `).join('')}
          </div>

          <div class="form-group">
            <label class="form-label" for="tplModalSubject">Email Subject Line *</label>
            <input type="text" name="subject" id="tplModalSubject" class="form-input" style="font-weight: 600;" required value="${template.subject}" placeholder="e.g. Invitation for {Name} - Aparaitech Drive" />
          </div>

          <div class="form-group">
            <label class="form-label" for="tplModalBody">Email Body (HTML Content) *</label>
            <textarea name="body_html" id="tplModalBody" class="form-input" style="font-family: var(--font-mono); font-size: 0.84rem; min-height: 220px; line-height: 1.4;" required>${template.body_html}</textarea>
          </div>

          <div class="modal-actions" style="margin-top: 20px;">
            <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btnSaveTplModal">💾 Save Template</button>
          </div>
        </form>
      </div>
    `;

    app.openModal(modalHtml);
  },

  insertTagIntoForm(tag) {
    const bodyInput = document.getElementById('tplModalBody');
    if (!bodyInput) return;
    const start = bodyInput.selectionStart || bodyInput.value.length;
    const end = bodyInput.selectionEnd || bodyInput.value.length;
    const text = bodyInput.value;
    bodyInput.value = text.substring(0, start) + tag + text.substring(end);
    bodyInput.focus();
    bodyInput.selectionStart = bodyInput.selectionEnd = start + tag.length;
  },

  async submitSaveTemplate(event) {
    if (event) event.preventDefault();
    const form = event ? event.target : document.getElementById('templateEditForm');
    const submitBtn = document.getElementById('btnSaveTplModal');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const name = (document.getElementById('tplModalName')?.value || form?.elements['name']?.value || '').trim();
      const category = document.getElementById('tplModalCategory')?.value || form?.elements['category']?.value || 'Placement Drive';
      const subject = (document.getElementById('tplModalSubject')?.value || form?.elements['subject']?.value || '').trim();
      const body_html = document.getElementById('tplModalBody')?.value || form?.elements['body_html']?.value || '';

      if (!name) throw new Error('Template name is required.');
      if (!subject) throw new Error('Subject line is required.');

      const payload = { name, category, subject, body_html };

      if (this.state.editingTemplateId) {
        await api.updateTemplate(this.state.editingTemplateId, payload);
        app.showToast('Template changes saved successfully!', 'success', 'Saved');
      } else {
        await api.createTemplate(payload);
        app.showToast('New template created and saved!', 'success', 'Created');
      }

      app.closeModal();
      await this.render(document.getElementById('viewContainer'));
      await app.refreshCounters();
    } catch (err) {
      if (submitBtn) submitBtn.disabled = false;
      app.showToast(err.message, 'error', 'Save Failed');
    }
  },

  async deleteTemplate(templateId, name) {
    if (!confirm(`Are you sure you want to delete the template "${name}"?`)) {
      return;
    }

    try {
      await api.deleteTemplate(templateId);
      app.showToast('Template deleted successfully', 'success', 'Deleted');
      await this.render(document.getElementById('viewContainer'));
    } catch (err) {
      app.showToast(err.message, 'error', 'Delete Failed');
    }
  },

  useInComposer(templateId) {
    const template = this.state.templates.find(t => t.id === templateId);
    if (!template) return;

    app.navigate('composer', {
      templateId: template.id,
      subject: template.subject,
      bodyHtml: template.body_html
    });
  }
};
