// WhatsApp Agent Frontend Application
class WhatsAppAgent {
    constructor() {
        this.currentSession = null;
        this.currentChat = null;
        this.pollingInterval = null;
        this.sessions = [];
        this.init();
    }
    
    // ==================== CAMPAIGN ACTIONS ====================
    
    async startCampaign(campaignId) {
        try {
            await this.apiCall(`/api/campaigns/${campaignId}/start`, { method: 'POST' });
            this.showToast('Campaign started successfully', 'success');
            this.loadCampaigns();
            this.loadProcessingStatus();
        } catch (error) {
            console.error('Error starting campaign:', error);
            this.showToast('Failed to start campaign', 'error');
        }
    }
    
    async pauseCampaign(campaignId) {
        try {
            await this.apiCall(`/api/campaigns/${campaignId}/pause`, { method: 'POST' });
            this.showToast('Campaign paused successfully', 'success');
            this.loadCampaigns();
            this.loadProcessingStatus();
        } catch (error) {
            console.error('Error pausing campaign:', error);
            this.showToast('Failed to pause campaign', 'error');
        }
    }
    
    async resumeCampaign(campaignId) {
        try {
            await this.apiCall(`/api/campaigns/${campaignId}/start`, { method: 'POST' });
            this.showToast('Campaign resumed successfully', 'success');
            this.loadCampaigns();
            this.loadProcessingStatus();
        } catch (error) {
            console.error('Error resuming campaign:', error);
            this.showToast('Failed to resume campaign', 'error');
        }
    }
    
    async stopCampaign(campaignId) {
        if (!confirm('Are you sure you want to stop this campaign? This action cannot be undone.')) {
            return;
        }
        
        try {
            await this.apiCall(`/api/campaigns/${campaignId}/stop`, { method: 'POST' });
            this.showToast('Campaign stopped successfully', 'success');
            this.loadCampaigns();
            this.loadProcessingStatus();
        } catch (error) {
            console.error('Error stopping campaign:', error);
            this.showToast('Failed to stop campaign', 'error');
        }
    }
    
    async deleteCampaign(campaignId) {
        if (!confirm('Are you sure you want to delete this campaign? All data will be lost.')) {
            return;
        }
        
        try {
            await this.apiCall(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
            this.showToast('Campaign deleted successfully', 'success');
            this.loadCampaigns();
            
            // Clear campaign controls
            document.getElementById('campaign-controls').innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-hand-index display-4"></i>
                    <p class="mt-3">Select a campaign to view controls</p>
                </div>
            `;
        } catch (error) {
            console.error('Error deleting campaign:', error);
            this.showToast('Failed to delete campaign', 'error');
        }
    }
    
    // ==================== CAMPAIGN WIZARD ====================
    
    currentWizardStep = 1;
    uploadedFileData = null;
    
    modalNextStep() {
        if (this.currentWizardStep < 4 && this.validateCurrentStep()) {
            this.currentWizardStep++;
            this.updateWizardStepIndicators();
            this.showWizardStep(this.currentWizardStep);
        }
    }
    
    modalPrevStep() {
        if (this.currentWizardStep > 1) {
            this.currentWizardStep--;
            this.updateWizardStepIndicators();
            this.showWizardStep(this.currentWizardStep);
        }
    }
    
    validateCurrentStep() {
        switch (this.currentWizardStep) {
            case 1:
                const name = document.getElementById('modal-campaign-name').value;
                const session = document.getElementById('modal-campaign-session').value;
                const file = document.getElementById('modal-campaign-file').files[0];
                return name && session && file;
            case 2:
                // Check if phone number column is mapped
                const phoneMapping = document.getElementById('mapping-phone')?.value;
                return this.uploadedFileData && this.uploadedFileData.valid && phoneMapping;
            case 3:
                // Check if at least one message template/sample exists
                const mode = document.querySelector('input[name="modalMessageMode"]:checked')?.value;
                if (mode === 'single') {
                    const template = document.getElementById('modal-single-template')?.value;
                    return template && template.trim().length > 0;
                } else {
                    const samples = document.querySelectorAll('.modal-sample-text');
                    return samples.length > 0 && Array.from(samples).some(s => s.value.trim().length > 0);
                }
            case 4:
                // For step 4, validate all previous steps
                // Temporarily set step to validate each previous step
                let allValid = true;
                for (let i = 1; i <= 3; i++) {
                    const prevStep = this.currentWizardStep;
                    this.currentWizardStep = i;
                    if (!this.validateCurrentStep()) {
                        allValid = false;
                    }
                    this.currentWizardStep = prevStep;
                }
                return allValid;
            default:
                return false;
        }
    }
    
    updateWizardStepIndicators() {
        for (let i = 1; i <= 4; i++) {
            const indicator = document.getElementById(`step-indicator-${i}`);
            if (!indicator) continue;
            
            const badge = indicator.querySelector('.badge');
            
            indicator.classList.remove('active', 'completed');
            badge.classList.remove('bg-primary', 'bg-success', 'bg-secondary');
            
            if (i < this.currentWizardStep) {
                indicator.classList.add('completed');
                badge.classList.add('bg-success');
            } else if (i === this.currentWizardStep) {
                indicator.classList.add('active');
                badge.classList.add('bg-primary');
            } else {
                badge.classList.add('bg-secondary');
            }
        }
    }
    
    showWizardStep(stepNumber) {
        // Hide all steps
        document.querySelectorAll('.wizard-step').forEach(step => {
            step.style.display = 'none';
        });
        
        // Show current step
        const currentStep = document.getElementById(`step-${stepNumber}`);
        if (currentStep) {
            currentStep.style.display = 'block';
        }
        
        // If showing step 4, generate summary
        if (stepNumber === 4) {
            this.generateCampaignSummary();
        }
        
        // Update buttons
        this.updateWizardButtons();
        
        // Also update on input changes for current step
        if (stepNumber === 3) {
            // Add listeners to message inputs to update button state
            const singleTemplate = document.getElementById('modal-single-template');
            const sampleTexts = document.querySelectorAll('.modal-sample-text');
            
            if (singleTemplate) {
                singleTemplate.oninput = () => this.updateWizardButtons();
            }
            
            sampleTexts.forEach(sample => {
                sample.oninput = () => this.updateWizardButtons();
            });
        }
    }
    
    generateCampaignSummary() {
        const summaryContainer = document.getElementById('modal-campaign-summary');
        if (!summaryContainer || !this.uploadedFileData) return;
        
        const name = document.getElementById('modal-campaign-name')?.value || 'Unnamed';
        const session = document.getElementById('modal-campaign-session')?.value || 'None';
        const startRow = document.getElementById('modal-start-row')?.value || '1';
        const endRow = document.getElementById('modal-end-row')?.value || 'All';
        const delay = document.getElementById('modal-delay-seconds')?.value || '5';
        const retries = document.getElementById('modal-retry-attempts')?.value || '3';
        const maxDaily = document.getElementById('modal-max-daily')?.value || '1000';
        const mode = document.querySelector('input[name="modalMessageMode"]:checked')?.value || 'single';
        const phoneCol = document.getElementById('mapping-phone')?.value || 'Not mapped';
        const nameCol = document.getElementById('mapping-name')?.value || 'Not mapped';
        
        let messageInfo = '';
        if (mode === 'single') {
            const template = document.getElementById('modal-single-template')?.value || '';
            messageInfo = `<strong>Template:</strong><br><pre class="bg-light p-2 rounded">${template}</pre>`;
        } else {
            const samples = Array.from(document.querySelectorAll('.modal-sample-text'));
            messageInfo = `<strong>${samples.length} Message Samples</strong> (randomly selected per recipient)`;
        }
        
        const totalRows = endRow === 'All' ? this.uploadedFileData.rows : Math.min(parseInt(endRow), this.uploadedFileData.rows) - parseInt(startRow) + 1;
        const estimatedTime = (totalRows * parseInt(delay)) / 60; // in minutes
        
        summaryContainer.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6 class="text-primary mb-3">Campaign Details</h6>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Session:</strong> ${session}</p>
                    <p><strong>File:</strong> ${this.uploadedFileData.filename}</p>
                    <p><strong>Total Recipients:</strong> ${totalRows} messages</p>
                    <p><strong>Row Range:</strong> ${startRow} to ${endRow}</p>
                </div>
                <div class="col-md-6">
                    <h6 class="text-primary mb-3">Settings</h6>
                    <p><strong>Phone Column:</strong> ${phoneCol}</p>
                    <p><strong>Name Column:</strong> ${nameCol}</p>
                    <p><strong>Delay:</strong> ${delay} seconds between messages</p>
                    <p><strong>Retry Attempts:</strong> ${retries}</p>
                    <p><strong>Daily Limit:</strong> ${maxDaily} messages</p>
                    <p><strong>Est. Time:</strong> ~${estimatedTime.toFixed(1)} minutes</p>
                </div>
            </div>
            <div class="row mt-3">
                <div class="col-12">
                    <h6 class="text-primary mb-3">Message Configuration</h6>
                    <p><strong>Mode:</strong> ${mode === 'single' ? 'Single Template' : 'Multiple Samples'}</p>
                    ${messageInfo}
                </div>
            </div>
            <div class="row mt-3">
                <div class="col-12">
                    <h6 class="text-primary mb-3">Exclusion Filters</h6>
                    ${this.getExclusionFiltersDisplay()}
                </div>
            </div>
        `;
    }
    
    getExclusionFiltersDisplay() {
        const excludeMyContacts = document.getElementById('modal-exclude-my-contacts')?.checked;
        const excludePrevConversations = document.getElementById('modal-exclude-previous-conversations')?.checked;
        
        const filters = [];
        if (excludeMyContacts) {
            filters.push('<li><i class="bi bi-person-x me-1"></i> Exclude contacts saved in phone</li>');
        }
        if (excludePrevConversations) {
            filters.push('<li><i class="bi bi-chat-x me-1"></i> Exclude contacts with previous conversations</li>');
        }
        
        if (filters.length === 0) {
            return '<p class="text-muted">No exclusion filters applied - messages will be sent to all contacts in the file</p>';
        }
        
        return `<ul class="mb-0">${filters.join('')}</ul>`;
    }
    
    updateWizardButtons() {
        const prevBtn = document.getElementById('modal-prev-btn');
        const nextBtn = document.getElementById('modal-next-btn');
        const saveBtn = document.getElementById('modal-save-btn');
        const launchBtn = document.getElementById('modal-launch-btn');
        
        if (!prevBtn || !nextBtn || !saveBtn || !launchBtn) return;
        
        // Show/hide back button
        prevBtn.style.display = this.currentWizardStep > 1 ? 'block' : 'none';
        
        // Update next button
        if (this.currentWizardStep < 4) {
            nextBtn.style.display = 'block';
            saveBtn.style.display = 'none';
            launchBtn.style.display = 'none';
            
            const stepNames = ['', 'Data Mapping', 'Message Config', 'Review & Launch'];
            nextBtn.innerHTML = `Next: ${stepNames[this.currentWizardStep]} <i class="bi bi-arrow-right"></i>`;
            
            // Enable/disable based on step validation
            nextBtn.disabled = !this.validateCurrentStep();
        } else {
            // Step 4: Review & Launch
            nextBtn.style.display = 'none';
            saveBtn.style.display = 'block';
            launchBtn.style.display = 'block';
            
            // Enable Launch button if all previous steps are valid
            const allStepsValid = this.validateCurrentStep();
            launchBtn.disabled = !allStepsValid;
            saveBtn.disabled = !allStepsValid;
        }
    }
    
    async handleModalFileUpload() {
        const fileInput = document.getElementById('modal-campaign-file');
        const file = fileInput.files[0];
        
        if (!file) return;
        
        const fileInfo = document.getElementById('modal-file-info');
        
        // Show file info
        fileInfo.style.display = 'block';
        fileInfo.innerHTML = `
            <div class="file-info-card">
                <div class="d-flex align-items-center">
                    <div class="file-icon">
                        <i class="bi bi-file-earmark-spreadsheet"></i>
                    </div>
                    <div class="flex-grow-1">
                        <div class="fw-bold">${file.name}</div>
                        <small class="text-muted">${(file.size / 1024 / 1024).toFixed(2)} MB • ${file.type || 'Unknown type'}</small>
                        <div class="mt-1">
                            <div class="spinner-border spinner-border-sm me-2"></div>
                            <span class="text-muted">Uploading and processing file...</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Create FormData and upload file
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch('/api/files/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'File upload failed');
            }
            
            const result = await response.json();
            
            if (result.success && result.data) {
                this.uploadedFileData = {
                    valid: true,
                    file_path: result.data.file_path,
                    filename: result.data.filename,
                    rows: result.data.total_rows,
                    columns: result.data.headers.length,
                    headers: result.data.headers,
                    sample_data: result.data.sample_data,
                    suggested_mapping: result.data.suggested_mapping
                };
                
                fileInfo.innerHTML = `
                    <div class="file-info-card">
                        <div class="d-flex align-items-center">
                            <div class="file-icon">
                                <i class="bi bi-check-circle-fill text-success"></i>
                            </div>
                            <div class="flex-grow-1">
                                <div class="fw-bold">${this.uploadedFileData.filename}</div>
                                <small class="text-success">✅ ${this.uploadedFileData.rows} rows, ${this.uploadedFileData.columns} columns</small>
                                <div class="mt-1">
                                    <small class="text-muted">Headers: ${this.uploadedFileData.headers.join(', ')}</small>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                this.showToast('File uploaded and validated successfully', 'success');
                this.updateWizardButtons();
                
                // Populate column mapping in step 2
                this.populateColumnMapping();
                
                // Update row range inputs with file data
                const endRowInput = document.getElementById('modal-end-row');
                if (endRowInput) {
                    endRowInput.placeholder = `Leave empty for all rows (${this.uploadedFileData.rows} total)`;
                }
                
            } else {
                throw new Error('Invalid response from server');
            }
            
        } catch (error) {
            console.error('File upload error:', error);
            
            fileInfo.innerHTML = `
                <div class="file-info-card">
                    <div class="d-flex align-items-center">
                        <div class="file-icon">
                            <i class="bi bi-x-circle-fill text-danger"></i>
                        </div>
                        <div class="flex-grow-1">
                            <div class="fw-bold">${file.name}</div>
                            <small class="text-danger">❌ Upload failed: ${error.message}</small>
                        </div>
                    </div>
                </div>
            `;
            
            this.uploadedFileData = null;
            this.showToast('File upload failed: ' + error.message, 'error');
            this.updateWizardButtons();
        }
    }
    
    toggleModalMessageMode() {
        const mode = document.querySelector('input[name="modalMessageMode"]:checked')?.value;
        const singleSection = document.getElementById('modalSingleTemplateSection');
        const multipleSection = document.getElementById('modalMultipleSamplesSection');
        
        if (!singleSection || !multipleSection) return;
        
        if (mode === 'single') {
            singleSection.style.display = 'block';
            multipleSection.style.display = 'none';
        } else {
            singleSection.style.display = 'none';
            multipleSection.style.display = 'block';
        }
        
        // Update wizard buttons when mode changes
        this.updateWizardButtons();
    }
    
    addModalSample() {
        const container = document.getElementById('modalSamplesContainer');
        if (!container) return;
        
        const sampleCount = container.children.length + 1;
        
        const sampleDiv = document.createElement('div');
        sampleDiv.className = 'sample-input mb-2';
        sampleDiv.innerHTML = `
            <div class="input-group">
                <span class="input-group-text">Sample ${sampleCount}</span>
                <textarea class="form-control modal-sample-text" rows="2" 
                          placeholder="Enter sample message with {name} variables"></textarea>
                <button class="btn btn-outline-danger" type="button" onclick="removeModalSample(this)">
                    🗑️
                </button>
            </div>
        `;
        
        container.appendChild(sampleDiv);
        this.updateModalSampleNumbers();
        
        // Add input listener to new textarea for button state updates
        const newTextarea = sampleDiv.querySelector('.modal-sample-text');
        if (newTextarea) {
            newTextarea.oninput = () => this.updateWizardButtons();
        }
    }
    
    removeModalSample(button) {
        const container = document.getElementById('modalSamplesContainer');
        if (!container || container.children.length <= 1) return;
        
        button.closest('.sample-input').remove();
        this.updateModalSampleNumbers();
        this.updateWizardButtons(); // Update button state after removal
    }
    
    updateModalSampleNumbers() {
        const container = document.getElementById('modalSamplesContainer');
        if (!container) return;
        
        Array.from(container.children).forEach((child, index) => {
            const span = child.querySelector('.input-group-text');
            if (span) span.textContent = `Sample ${index + 1}`;
            
            const button = child.querySelector('.btn-outline-danger');
            if (button) button.disabled = container.children.length === 1;
        });
    }
    
    populateColumnMapping() {
        if (!this.uploadedFileData || !this.uploadedFileData.headers) return;
        
        const mappingContainer = document.getElementById('modal-column-mapping');
        const previewContainer = document.getElementById('modal-data-preview');
        
        if (!mappingContainer || !previewContainer) return;
        
        // Create column mapping UI
        const headers = this.uploadedFileData.headers;
        const suggestedMapping = this.uploadedFileData.suggested_mapping || {};
        
        mappingContainer.innerHTML = `
            <div class="alert alert-info mb-3">
                <i class="bi bi-info-circle me-2"></i>
                Map your CSV columns to the required fields
            </div>
            <div class="mb-3">
                <label class="form-label">Phone Number Column *</label>
                <select class="form-select" id="mapping-phone">
                    <option value="">Select column...</option>
                    ${headers.map(h => 
                        `<option value="${h}" ${suggestedMapping.phone_number === h ? 'selected' : ''}>${h}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="mb-3">
                <label class="form-label">Name Column (optional)</label>
                <select class="form-select" id="mapping-name">
                    <option value="">Select column...</option>
                    ${headers.map(h => 
                        `<option value="${h}" ${suggestedMapping.name === h ? 'selected' : ''}>${h}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="mb-3">
                <label class="form-label">Additional Columns (for template variables)</label>
                <small class="text-muted">These columns can be used as {variables} in your message template</small>
                <div class="mt-2">
                    ${headers.map(h => `
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" value="${h}" id="mapping-var-${h}">
                            <label class="form-check-label" for="mapping-var-${h}">
                                ${h}
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        // Show data preview
        if (this.uploadedFileData.sample_data && this.uploadedFileData.sample_data.length > 0) {
            const sampleData = this.uploadedFileData.sample_data.slice(0, 5); // Show first 5 rows
            
            previewContainer.innerHTML = `
                <table class="table table-sm table-bordered">
                    <thead>
                        <tr>
                            ${headers.map(h => `<th>${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${sampleData.map(row => `
                            <tr>
                                ${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <small class="text-muted">Showing first ${sampleData.length} rows of ${this.uploadedFileData.rows} total</small>
            `;
        }
    }
    
    async launchModalCampaign() {
        try {
            // Prepare campaign data
            const campaignData = this.prepareCampaignData();
            
            // Get column mapping
            const columnMapping = {
                phone_number: document.getElementById('mapping-phone')?.value || '',
                name: document.getElementById('mapping-name')?.value || ''
            };
            
            // Add additional mapped columns
            const varCheckboxes = document.querySelectorAll('[id^="mapping-var-"]:checked');
            varCheckboxes.forEach(cb => {
                const colName = cb.value;
                if (colName && !columnMapping[colName]) {
                    columnMapping[colName] = colName;
                }
            });
            
            // Prepare form data for campaign creation
            const formData = new FormData();
            formData.append('campaign_name', campaignData.name);
            formData.append('session_name', campaignData.session_name);
            formData.append('file_path', this.uploadedFileData.file_path);
            formData.append('column_mapping', JSON.stringify(columnMapping));
            formData.append('message_mode', campaignData.message_mode);
            formData.append('message_samples', JSON.stringify(campaignData.message_samples));
            formData.append('use_csv_samples', document.getElementById('modalUseCsvSamples')?.checked || false);
            formData.append('start_row', document.getElementById('modal-start-row')?.value || 1);
            formData.append('end_row', document.getElementById('modal-end-row')?.value || '');
            formData.append('delay_seconds', campaignData.delay_seconds);
            formData.append('retry_attempts', campaignData.retry_attempts);
            formData.append('max_daily_messages', document.getElementById('modal-max-daily')?.value || 1000);
            formData.append('exclude_my_contacts', document.getElementById('modal-exclude-my-contacts')?.checked || false);
            formData.append('exclude_previous_conversations', document.getElementById('modal-exclude-previous-conversations')?.checked || false);
            
            // Create campaign using the file endpoint
            const response = await fetch('/api/files/create-campaign', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Campaign creation failed');
            }
            
            const result = await response.json();
            
            if (result.success && result.data) {
                this.showToast('Campaign created successfully!', 'success');
                
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('campaignWizardModal'));
                if (modal) modal.hide();
                
                // Reset wizard
                this.resetCampaignWizard();
                
                // Refresh campaigns list
                this.loadCampaigns();
                this.loadProcessingStatus();
            } else {
                throw new Error(result.error || 'Campaign creation failed');
            }
            
        } catch (error) {
            console.error('Error launching campaign:', error);
            this.showToast('Failed to launch campaign: ' + error.message, 'error');
        }
    }
    
    prepareCampaignData() {
        const name = document.getElementById('modal-campaign-name')?.value || 'New Campaign';
        const session = document.getElementById('modal-campaign-session')?.value || 'default';
        const delay = parseInt(document.getElementById('modal-delay-seconds')?.value) || 5;
        const retries = parseInt(document.getElementById('modal-retry-attempts')?.value) || 3;
        
        const messageMode = document.querySelector('input[name="modalMessageMode"]:checked')?.value || 'single';
        
        let messageData = {};
        if (messageMode === 'single') {
            const template = document.getElementById('modal-single-template')?.value || 'Hello {name}!';
            messageData = {
                message_mode: 'single',
                message_samples: [{ text: template }]
            };
        } else {
            const samples = Array.from(document.querySelectorAll('.modal-sample-text') || []).map(textarea => ({
                text: textarea.value || 'Hello {name}!'
            }));
            messageData = {
                message_mode: 'multiple',
                message_samples: samples.length > 0 ? samples : [{ text: 'Hello {name}!' }]
            };
        }
        
        return {
            name,
            session_name: session,
            delay_seconds: delay,
            retry_attempts: retries,
            ...messageData
        };
    }
    
    saveModalCampaignDraft() {
        this.showToast('Draft save functionality coming soon!', 'info');
    }
    
    previewModalTemplate() {
        const mode = document.querySelector('input[name="modalMessageMode"]:checked')?.value;
        const previewContainer = document.getElementById('modal-template-preview');
        
        if (!previewContainer) return;
        
        let templates = [];
        
        if (mode === 'single') {
            const template = document.getElementById('modal-single-template')?.value || '';
            if (template.trim()) {
                templates.push(template);
            }
        } else {
            const samples = document.querySelectorAll('.modal-sample-text');
            samples.forEach(sample => {
                if (sample.value.trim()) {
                    templates.push(sample.value);
                }
            });
        }
        
        if (templates.length === 0) {
            this.showToast('Please enter at least one message template', 'warning');
            return;
        }
        
        // Get sample data from uploaded file or use defaults
        let sampleData = {
            name: 'John Doe',
            phone_number: '1234567890'
        };
        
        // If we have uploaded file data, use the first row as sample
        if (this.uploadedFileData && this.uploadedFileData.sample_data && this.uploadedFileData.sample_data.length > 0) {
            const firstRow = this.uploadedFileData.sample_data[0];
            const nameCol = document.getElementById('mapping-name')?.value;
            
            if (nameCol && firstRow[nameCol]) {
                sampleData.name = firstRow[nameCol];
            }
            
            // Add all mapped columns to sample data
            const varCheckboxes = document.querySelectorAll('[id^="mapping-var-"]:checked');
            varCheckboxes.forEach(cb => {
                const colName = cb.value;
                if (colName && firstRow[colName]) {
                    sampleData[colName] = firstRow[colName];
                }
            });
        }
        
        // Generate preview HTML
        let previewHtml = `
            <div class="card border-primary mt-3 shadow-lg animate__animated animate__fadeIn">
                <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                    <span><i class="bi bi-eye me-2"></i>Message Preview</span>
                    <button type="button" class="btn-close btn-close-white" onclick="document.getElementById('modal-template-preview').style.display='none'" title="Close preview (ESC)"></button>
                </div>
                <div class="card-body">
        `;
        
        templates.forEach((template, index) => {
            // Replace variables in template
            let processedMessage = template;
            Object.keys(sampleData).forEach(key => {
                const regex = new RegExp(`\\{${key}\\}`, 'gi');
                processedMessage = processedMessage.replace(regex, sampleData[key]);
            });
            
            previewHtml += `
                <div class="mb-3">
                    ${templates.length > 1 ? `<h6 class="text-muted">Sample ${index + 1}:</h6>` : ''}
                    <div class="whatsapp-message-preview p-3 rounded" style="background-color: #DCF8C6; border-left: 3px solid #25D366;">
                        <div style="white-space: pre-wrap; font-family: 'Segoe UI', sans-serif;">${processedMessage}</div>
                        <div class="text-end mt-2">
                            <small class="text-muted">
                                <i class="bi bi-check2-all text-primary"></i> ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </small>
                        </div>
                    </div>
                </div>
            `;
        });
        
        previewHtml += `
                    <div class="alert alert-info mt-3">
                        <i class="bi bi-info-circle me-2"></i>
                        <small><strong>Variables detected:</strong> ${Object.keys(sampleData).map(k => `{${k}}`).join(', ')}</small>
                    </div>
                </div>
            </div>
        `;
        
        previewContainer.innerHTML = previewHtml;
        previewContainer.style.display = 'block';
        
        // Scroll to preview
        previewContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Add ESC key handler to close preview
        const escHandler = (e) => {
            if (e.key === 'Escape' && previewContainer.style.display !== 'none') {
                previewContainer.style.display = 'none';
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    resetCampaignWizard() {
        // Reset wizard state
        this.currentWizardStep = 1;
        this.uploadedFileData = null;
        
        // Clear form fields
        document.getElementById('modal-campaign-name').value = '';
        document.getElementById('modal-campaign-session').value = '';
        document.getElementById('modal-campaign-file').value = '';
        document.getElementById('modal-file-info').style.display = 'none';
        document.getElementById('modal-single-template').value = '';
        document.getElementById('modal-start-row').value = '1';
        document.getElementById('modal-end-row').value = '';
        
        // Reset to step 1
        this.updateWizardStepIndicators();
        this.showWizardStep(1);
    }
    
    // ==================== ANALYTICS ====================
    
    async loadAnalytics() {
        try {
            // Simulate analytics data for now
            const analytics = {
                total_campaigns: 5,
                total_sent: 1250,
                success_rate: 87,
                avg_delivery_time: 2.3,
                active_campaigns: 1,
                sample_types: 3
            };
            
            this.displayAnalytics(analytics);
        } catch (error) {
            console.error('Error loading analytics:', error);
            this.showToast('Failed to load analytics', 'error');
        }
    }
    
    displayAnalytics(analytics) {
        // Update overview stats
        const elements = {
            'analytics-total-campaigns': analytics.total_campaigns || 0,
            'analytics-total-sent': analytics.total_sent || 0,
            'analytics-success-rate': (analytics.success_rate || 0) + '%',
            'analytics-avg-time': (analytics.avg_delivery_time || 0) + 's',
            'analytics-active': analytics.active_campaigns || 0,
            'analytics-samples': analytics.sample_types || 0
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
        
        // Display placeholder content for other sections
        this.displayPlaceholderAnalytics();
    }
    
    displayPlaceholderAnalytics() {
        const samplePerformance = document.getElementById('sample-performance');
        if (samplePerformance) {
            samplePerformance.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-bar-chart display-4"></i>
                    <p class="mt-2">Sample performance data will appear here</p>
                </div>
            `;
        }
        
        const timeline = document.getElementById('campaign-timeline');
        if (timeline) {
            timeline.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-clock-history display-4"></i>
                    <p class="mt-2">Recent campaign activity will appear here</p>
                </div>
            `;
        }
        
        const analyticsTable = document.getElementById('analytics-table');
        if (analyticsTable) {
            analyticsTable.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-table display-4"></i>
                    <p class="mt-2">Detailed campaign reports will appear here</p>
                </div>
            `;
        }
    }

    init() {
        try {
            // Initialize application
            console.log('Initializing WhatsApp Agent...');
            this.checkServerStatus();
            this.loadSessions();
            this.populateSessionSelects();
            
            // Set up periodic refresh
            setInterval(() => {
                this.checkServerStatus();
                if (this.sessions.length > 0) {
                    this.loadSessions();
                }
            }, 30000); // Refresh every 30 seconds
            
            console.log('Initialization complete');
        } catch (error) {
            console.error('Error during initialization:', error);
            throw error;
        }
    }

    // ==================== UTILITY FUNCTIONS ====================
    
    showToast(message, type = 'info') {
        const toastElement = document.getElementById('notification-toast');
        const toastBody = document.getElementById('toast-message');
        
        toastBody.textContent = message;
        toastElement.className = `toast toast-${type}`;
        
        const toast = new bootstrap.Toast(toastElement);
        toast.show();
    }

    formatTime(timestamp) {
        return new Date(timestamp * 1000).toLocaleTimeString();
    }

    formatDate(timestamp) {
        return new Date(timestamp * 1000).toLocaleDateString();
    }

    getInitials(name) {
        return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
    }

    formatPhoneNumber(phone) {
        return phone.replace('@c.us', '').replace('@g.us', '');
    }

    // ==================== API FUNCTIONS ====================
    
    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(endpoint, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return response;
            }
        } catch (error) {
            console.error('API Error:', error);
            this.showToast(`API Error: ${error.message}`, 'error');
            throw error;
        }
    }

    // ==================== PHASE 2: CAMPAIGN MANAGEMENT ====================
    
    async loadCampaigns() {
        try {
            const response = await this.apiCall('/api/campaigns');
            
            // Handle response format
            let campaigns = [];
            if (response.success && response.data) {
                campaigns = response.data;
            } else if (Array.isArray(response)) {
                campaigns = response;
            } else {
                console.warn('Unexpected campaigns response format:', response);
            }
            
            this.displayCampaigns(campaigns);
            
            // Load campaign stats
            try {
                const statsResponse = await this.apiCall('/api/campaigns/stats');
                const stats = statsResponse.data || statsResponse;
                this.updateCampaignStats(stats);
            } catch (statsError) {
                console.warn('Failed to load campaign stats:', statsError);
                // Set default stats if failed
                this.updateCampaignStats({
                    total_campaigns: campaigns.length,
                    active_campaigns: campaigns.filter(c => c.status === 'RUNNING' || c.status === 'PAUSED').length,
                    completed_campaigns: campaigns.filter(c => c.status === 'COMPLETED').length,
                    total_messages: 0
                });
            }
            
        } catch (error) {
            console.error('Error loading campaigns:', error);
            this.showToast('Failed to load campaigns', 'error');
            
            // Show empty state
            this.displayCampaigns([]);
        }
    }
    
    displayCampaigns(campaigns) {
        const container = document.getElementById('campaigns-list');
        const emptyState = document.getElementById('campaigns-empty');
        
        if (!campaigns || campaigns.length === 0) {
            container.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }
        
        container.style.display = 'block';
        emptyState.style.display = 'none';
        
        container.innerHTML = campaigns.map(campaign => `
            <div class="campaign-card card mb-3" onclick="selectCampaign('${campaign.id}')" data-campaign-id="${campaign.id}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="card-title mb-0">${campaign.name}</h6>
                        <span class="campaign-status status-${campaign.status.toLowerCase()}">${campaign.status}</span>
                    </div>
                    <div class="row">
                        <div class="col-md-6">
                            <small class="text-muted">Session:</small>
                            <div class="fw-bold">${campaign.session_name}</div>
                            <small class="text-muted">Created:</small>
                            <div>${new Date(campaign.created_at).toLocaleDateString()}</div>
                        </div>
                        <div class="col-md-6">
                            <small class="text-muted">Progress:</small>
                            <div class="fw-bold">${campaign.processed_rows || 0}/${campaign.total_rows || 0} messages</div>
                            <div class="campaign-progress">
                                <div class="campaign-progress-bar" style="width: ${this.calculateProgress(campaign)}%"></div>
                            </div>
                        </div>
                    </div>
                    <div class="mt-2">
                        <small class="text-muted">Success Rate:</small>
                        <span class="fw-bold text-success">${this.calculateSuccessRate(campaign)}%</span>
                        <small class="text-muted ms-3">Message Mode:</small>
                        <span class="fw-bold">${campaign.message_mode === 'multiple' ? '🎲 Multiple Samples' : '📝 Single Template'}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    calculateProgress(campaign) {
        if (!campaign.total_rows || campaign.total_rows === 0) return 0;
        return Math.round((campaign.processed_rows || 0) / campaign.total_rows * 100);
    }
    
    calculateSuccessRate(campaign) {
        if (!campaign.processed_rows || campaign.processed_rows === 0) return 0;
        return Math.round((campaign.success_count || 0) / campaign.processed_rows * 100);
    }
    
    updateCampaignStats(stats) {
        document.getElementById('total-campaigns').textContent = stats.total_campaigns || 0;
        document.getElementById('active-campaigns').textContent = stats.active_campaigns || 0;
        document.getElementById('completed-campaigns').textContent = stats.completed_campaigns || 0;
        document.getElementById('total-messages').textContent = stats.total_messages || stats.total_messages_sent || 0;
    }
    
    async selectCampaign(campaignId) {
        try {
            // Remove active class from all campaign cards
            document.querySelectorAll('.campaign-card').forEach(card => {
                card.classList.remove('active');
            });
            
            // Add active class to selected card
            const selectedCard = document.querySelector(`[data-campaign-id="${campaignId}"]`);
            if (selectedCard) {
                selectedCard.classList.add('active');
            }
            
            // Load campaign details
            const response = await this.apiCall(`/api/campaigns/${campaignId}`);
            // Extract campaign data from response
            const campaign = response.data || response;
            this.displayCampaignControls(campaign);
            
        } catch (error) {
            console.error('Error selecting campaign:', error);
            this.showToast('Failed to load campaign details', 'error');
        }
    }
    
    displayCampaignControls(campaign) {
        const container = document.getElementById('campaign-controls');
        
        container.innerHTML = `
            <div class="campaign-details">
                <h6 class="text-primary">${campaign.name}</h6>
                <div class="mb-3">
                    <small class="text-muted">Status:</small>
                    <span class="campaign-status status-${campaign.status.toLowerCase()} ms-2">${campaign.status}</span>
                </div>
                
                <div class="row mb-3">
                    <div class="col-6">
                        <small class="text-muted">Total Messages:</small>
                        <div class="fw-bold">${campaign.total_rows || 0}</div>
                    </div>
                    <div class="col-6">
                        <small class="text-muted">Processed:</small>
                        <div class="fw-bold">${campaign.processed_rows || 0}</div>
                    </div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-6">
                        <small class="text-muted">Success:</small>
                        <div class="fw-bold text-success">${campaign.success_count || 0}</div>
                    </div>
                    <div class="col-6">
                        <small class="text-muted">Failed:</small>
                        <div class="fw-bold text-danger">${(campaign.processed_rows || 0) - (campaign.success_count || 0)}</div>
                    </div>
                </div>
                
                <div class="d-grid gap-2">
                    ${this.getCampaignActionButtons(campaign)}
                </div>
                
                <div class="mt-3">
                    <h6 class="text-secondary">Settings</h6>
                    <small class="text-muted">Delay:</small> <span class="fw-bold">${campaign.delay_seconds}s</span><br>
                    <small class="text-muted">Retries:</small> <span class="fw-bold">${campaign.retry_attempts}</span><br>
                    <small class="text-muted">Mode:</small> <span class="fw-bold">${campaign.message_mode === 'multiple' ? 'Multiple Samples' : 'Single Template'}</span>
                </div>
            </div>
        `;
    }
    
    getCampaignActionButtons(campaign) {
        switch (campaign.status) {
            case 'created':
                return `
                    <button class="btn btn-success" onclick="startCampaign('${campaign.id}')">
                        <i class="bi bi-play-fill"></i> Start Campaign
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteCampaign('${campaign.id}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                `;
            case 'running':
                return `
                    <button class="btn btn-warning" onclick="pauseCampaign('${campaign.id}')">
                        <i class="bi bi-pause-fill"></i> Pause Campaign
                    </button>
                    <button class="btn btn-outline-danger" onclick="stopCampaign('${campaign.id}')">
                        <i class="bi bi-stop-fill"></i> Stop Campaign
                    </button>
                `;
            case 'paused':
                return `
                    <button class="btn btn-success" onclick="resumeCampaign('${campaign.id}')">
                        <i class="bi bi-play-fill"></i> Resume Campaign
                    </button>
                    <button class="btn btn-outline-danger" onclick="stopCampaign('${campaign.id}')">
                        <i class="bi bi-stop-fill"></i> Stop Campaign
                    </button>
                `;
            case 'completed':
            case 'failed':
            case 'cancelled':
                return `
                    <button class="btn btn-outline-info" onclick="viewCampaignReport('${campaign.id}')">
                        <i class="bi bi-file-text"></i> View Report
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteCampaign('${campaign.id}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                `;
            default:
                return '<p class="text-muted">No actions available</p>';
        } 
    }
    
    async loadProcessingStatus() {
        try {
            const response = await this.apiCall('/api/files/processing/status');
            const status = response.data || response;
            this.displayProcessingStatus(status);
        } catch (error) {
            console.error('Error loading processing status:', error);
            // Show default empty state
            const container = document.getElementById('processing-status');
            if (container) {
                container.innerHTML = `
                    <div class="text-center text-muted py-3">
                        <i class="bi bi-pause-circle display-4"></i>
                        <p class="mt-2">No active campaigns</p>
                    </div>
                `;
            }
        }
    }
    
    displayProcessingStatus(status) {
        const container = document.getElementById('processing-status');
        if (!container) return;
        
        // Check if status has the expected structure
        const activeCampaigns = status?.processor?.active_campaigns || status?.active_campaigns || [];
        
        if (!activeCampaigns || activeCampaigns.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="bi bi-pause-circle display-4"></i>
                    <p class="mt-2">No active campaigns</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = activeCampaigns.map(campaign => `
            <div class="processing-status-item">
                <div class="processing-status-icon status-icon-${this.getStatusIconType(campaign.status)}">
                    <i class="bi bi-${this.getStatusIcon(campaign.status)}"></i>
                </div>
                <div class="flex-grow-1">
                    <div class="fw-bold">${campaign.name}</div>
                    <small class="text-muted">${campaign.current_message || 'Preparing...'}</small>
                    <div class="campaign-progress mt-1">
                        <div class="campaign-progress-bar" style="width: ${this.calculateProgress(campaign)}%"></div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    getStatusIconType(status) {
        switch (status) {
            case 'RUNNING': return 'success';
            case 'PAUSED': return 'warning';
            case 'FAILED': return 'danger';
            default: return 'info';
        }
    }
    
    getStatusIcon(status) {
        switch (status) {
            case 'RUNNING': return 'play-fill';
            case 'PAUSED': return 'pause-fill';
            case 'FAILED': return 'exclamation-triangle-fill';
            default: return 'info-circle-fill';
        }
    }

    // ==================== SERVER STATUS ====================
    
    async checkServerStatus() {
        try {
            const response = await this.apiCall('/api/ping');
            const statusElement = document.getElementById('server-status');
            statusElement.innerHTML = '<i class="bi bi-circle-fill me-1"></i>Connected';
            statusElement.className = 'badge bg-success me-3';
            
            // Load server info
            this.loadServerInfo();
        } catch (error) {
            const statusElement = document.getElementById('server-status');
            statusElement.innerHTML = '<i class="bi bi-circle-fill me-1"></i>Disconnected';
            statusElement.className = 'badge bg-danger me-3';
        }
    }

    async loadServerInfo() {
        try {
            const result = await this.apiCall('/api/server/info');
            if (result.success) {
                const serverInfoElement = document.getElementById('server-info');
                const { version, status } = result.data;
                
                serverInfoElement.innerHTML = `
                    <div class="mb-2">
                        <strong>Version:</strong> ${version.version || 'Unknown'}
                    </div>
                    <div class="mb-2">
                        <strong>Engine:</strong> ${version.engine || 'Unknown'}
                    </div>
                    <div>
                        <strong>Tier:</strong> 
                        <span class="badge bg-primary">${version.tier || 'Unknown'}</span>
                    </div>
                `;
            }
        } catch (error) {
            document.getElementById('server-info').innerHTML = `
                <div class="text-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Unable to load server info
                </div>
            `;
        }
    }

    // ==================== SESSION MANAGEMENT ====================
    
    async loadSessions() {
        try {
            const result = await this.apiCall('/api/sessions');
            if (result.success) {
                this.sessions = result.data;
                this.displaySessions(result.data);
                this.populateSessionSelects();
            }
        } catch (error) {
            this.showToast('Failed to load sessions', 'error');
        }
    }

    displaySessions(sessions) {
        const container = document.getElementById('sessions-list');
        const emptyState = document.getElementById('sessions-empty');
        
        if (sessions.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        container.innerHTML = sessions.map(session => {
            const statusClass = session.status === 'WORKING' ? 'status-working' : 
                              session.status === 'STARTING' ? 'status-starting' : 
                              session.status === 'SCAN_QR_CODE' ? 'status-qr' : 'status-stopped';
            
            return `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="card session-card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-3">
                                <h6 class="card-title mb-0">
                                    <i class="bi bi-phone me-2"></i>${session.name}
                                </h6>
                                <span class="session-status ${statusClass}">
                                    ${session.status}
                                </span>
                            </div>
                            
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="btn-group btn-group-sm">
                                    ${session.status === 'WORKING' ? `
                                        <button class="btn btn-outline-success btn-sm" onclick="app.stopSession('${session.name}')">
                                            <i class="bi bi-stop-fill"></i>
                                        </button>
                                    ` : session.status === 'STOPPED' ? `
                                        <button class="btn btn-outline-primary btn-sm" onclick="app.startSession('${session.name}')">
                                            <i class="bi bi-play-fill"></i>
                                        </button>
                                    ` : ''}
                                    <button class="btn btn-outline-warning btn-sm" onclick="app.restartSession('${session.name}')">
                                        <i class="bi bi-arrow-clockwise"></i>
                                    </button>
                                    <button class="btn btn-outline-danger btn-sm" onclick="app.deleteSession('${session.name}')">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                                
                                <!-- ✅ UPDATED: Screenshot available for WORKING and SCAN_QR_CODE -->
                                ${session.status === 'WORKING' || session.status === 'SCAN_QR_CODE' ? `
                                    <button class="btn btn-sm btn-info" onclick="app.getScreenshot('${session.name}')" 
                                            title="${session.status === 'SCAN_QR_CODE' ? 'Capture QR Code' : 'Take Screenshot'}">
                                        <i class="bi bi-camera"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    populateSessionSelects() {
        const selects = [
            'chat-session-select', 'contacts-session-select', 'groups-session-select',
            'check-session-select', 'group-session-select', 'message-session-select',
            'modal-campaign-session'  // Added for campaign creation modal
        ];
        
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                const currentValue = select.value;
                select.innerHTML = '<option value="">Select Session</option>' +
                    this.sessions
                        .filter(s => s.status === 'WORKING')
                        .map(s => `<option value="${s.name}">${s.name}</option>`)
                        .join('');
                
                // Restore previous selection if still valid
                if (currentValue && this.sessions.some(s => s.name === currentValue && s.status === 'WORKING')) {
                    select.value = currentValue;
                }
            }
        });
    }

    async createSession() {
        const sessionName = document.getElementById('session-name').value.trim();
        if (!sessionName) {
            this.showToast('Please enter a session name', 'warning');
            return;
        }

        try {
            const result = await this.apiCall('/api/sessions', {
                method: 'POST',
                body: JSON.stringify({ name: sessionName })
            });

            if (result.success) {
                this.currentSession = sessionName;
                this.showToast('Session created successfully', 'success');
                this.showQRCode(sessionName);
                this.startStatusPolling(sessionName);
            }
        } catch (error) {
            this.showToast('Failed to create session', 'error');
        }
    }

    async showQRCode(sessionName) {
        const qrSection = document.getElementById('qr-section');
        const qrImage = document.getElementById('qr-image');
        
        qrSection.style.display = 'block';
        qrImage.src = `/api/sessions/${sessionName}/qr?t=${Date.now()}`;
    }

    startStatusPolling(sessionName) {
        const loading = document.getElementById('auth-loading');
        const success = document.getElementById('auth-success');
        
        loading.style.display = 'block';
        success.style.display = 'none';
        
        this.pollingInterval = setInterval(async () => {
            try {
                const result = await this.apiCall(`/api/sessions/${sessionName}`);
                
                if (result.success && result.data.status === 'WORKING') {
                    clearInterval(this.pollingInterval);
                    loading.style.display = 'none';
                    success.style.display = 'block';
                    
                    this.showToast('Session connected successfully!', 'success');
                    this.loadSessions();
                    
                    setTimeout(() => {
                        document.getElementById('qr-section').style.display = 'none';
                        document.getElementById('session-name').value = '';
                    }, 3000);
                }
            } catch (error) {
                console.error('Status polling error:', error);
            }
        }, 2000);
    }

    async startSession(sessionName) {
        try {
            await this.apiCall(`/api/sessions/${sessionName}/start`, { method: 'POST' });
            this.showToast('Session started', 'success');
            setTimeout(() => this.loadSessions(), 1000);
        } catch (error) {
            this.showToast('Failed to start session', 'error');
        }
    }

    async stopSession(sessionName) {
        try {
            await this.apiCall(`/api/sessions/${sessionName}/stop`, { method: 'POST' });
            this.showToast('Session stopped', 'success');
            setTimeout(() => this.loadSessions(), 1000);
        } catch (error) {
            this.showToast('Failed to stop session', 'error');
        }
    }

    async restartSession(sessionName) {
        try {
            await this.apiCall(`/api/sessions/${sessionName}/restart`, { method: 'POST' });
            this.showToast('Session restarted', 'success');
            setTimeout(() => this.loadSessions(), 1000);
        } catch (error) {
            this.showToast('Failed to restart session', 'error');
        }
    }

    async deleteSession(sessionName) {
        if (!confirm(`Are you sure you want to delete session "${sessionName}"?`)) {
            return;
        }

        try {
            await this.apiCall(`/api/sessions/${sessionName}`, { method: 'DELETE' });
            this.showToast('Session deleted', 'success');
            this.loadSessions();
        } catch (error) {
            this.showToast('Failed to delete session', 'error');
        }
    }

    async getScreenshot(sessionName) {
        try {
            const response = await fetch(`/api/sessions/${sessionName}/screenshot`);
            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            }
        } catch (error) {
            this.showToast('Failed to get screenshot', 'error');
        }
    }

    // ==================== CHAT MANAGEMENT ====================
    
    async loadChats() {
        const sessionSelect = document.getElementById('chat-session-select');
        const session = sessionSelect.value;
        
        if (!session) {
            document.getElementById('chats-empty').style.display = 'block';
            document.getElementById('chats-list').innerHTML = '';
            return;
        }

        try {
            const result = await this.apiCall(`/api/chats/${session}`);
            if (result.success) {
                this.displayChats(result.data);
            }
        } catch (error) {
            this.showToast('Failed to load chats', 'error');
        }
    }

    displayChats(chats) {
        const container = document.getElementById('chats-list');
        const emptyState = document.getElementById('chats-empty');
        
        if (chats.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        container.innerHTML = chats.map(chat => {
            const lastMessage = chat.lastMessage || {};
            const displayName = chat.name || this.formatPhoneNumber(chat.id);
            
            return `
                <div class="list-group-item chat-item" onclick="app.selectChat('${chat.id}', '${displayName}')">
                    <div class="d-flex align-items-center">
                        <div class="chat-avatar me-3">
                            ${this.getInitials(displayName)}
                        </div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="chat-name">${displayName}</div>
                                <div class="chat-time">
                                    ${lastMessage.timestamp ? this.formatTime(lastMessage.timestamp) : ''}
                                </div>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="chat-last-message">
                                    ${lastMessage.body || 'No messages'}
                                </div>
                                ${chat.unreadCount > 0 ? `
                                    <div class="unread-count">${chat.unreadCount}</div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async selectChat(chatId, chatName) {
        this.currentChat = chatId;
        document.getElementById('chat-title').innerHTML = `
            <i class="bi bi-chat-square-dots me-2"></i>${chatName}
        `;
        
        document.getElementById('refresh-messages-btn').disabled = false;
        
        // Mark chat items as active
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });
        event.target.closest('.chat-item').classList.add('active');
        
        await this.loadMessages(chatId);
    }

    async loadMessages(chatId) {
        const sessionSelect = document.getElementById('chat-session-select');
        const session = sessionSelect.value;
        
        if (!session || !chatId) return;

        try {
            const result = await this.apiCall(`/api/chats/${session}/${chatId}/messages?limit=50`);
            if (result.success) {
                this.displayMessages(result.data);
            }
        } catch (error) {
            this.showToast('Failed to load messages', 'error');
        }
    }

    displayMessages(messages) {
        const container = document.getElementById('messages-list');
        
        if (messages.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-chat-square-text display-1"></i>
                    <p class="mt-3">No messages in this chat</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="d-flex flex-column">
                ${messages.reverse().map(message => {
                    const isFromMe = message.fromMe;
                    const messageClass = isFromMe ? 'message-sent' : 'message-received';
                    
                    return `
                        <div class="message ${messageClass}">
                            ${!isFromMe ? `<div class="message-from">${this.formatPhoneNumber(message.from)}</div>` : ''}
                            <div class="message-content">${message.body || '[Media]'}</div>
                            <div class="message-time">${this.formatTime(message.timestamp)}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    async refreshMessages() {
        if (this.currentChat) {
            await this.loadMessages(this.currentChat);
        }
    }

    // ==================== CONTACT MANAGEMENT ====================
    
    async loadContacts() {
        const sessionSelect = document.getElementById('contacts-session-select');
        const session = sessionSelect.value;
        
        if (!session) {
            document.getElementById('contacts-empty').style.display = 'block';
            document.getElementById('contacts-list').innerHTML = '';
            return;
        }

        try {
            const result = await this.apiCall(`/api/contacts/${session}`);
            if (result.success) {
                this.displayContacts(result.data);
            }
        } catch (error) {
            this.showToast('Failed to load contacts', 'error');
        }
    }

    displayContacts(contacts) {
        const container = document.getElementById('contacts-list');
        const emptyState = document.getElementById('contacts-empty');
        
        if (contacts.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        container.innerHTML = contacts.map(contact => {
            const displayName = contact.name || contact.pushname || this.formatPhoneNumber(contact.id);
            
            return `
                <div class="contact-card p-3 mb-2 border rounded">
                    <div class="d-flex align-items-center">
                        <div class="contact-avatar me-3">
                            ${this.getInitials(displayName)}
                        </div>
                        <div class="flex-grow-1">
                            <div class="contact-name">${displayName}</div>
                            <div class="contact-phone">${this.formatPhoneNumber(contact.id)}</div>
                        </div>
                        <div class="dropdown">
                            <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                                <i class="bi bi-three-dots-vertical"></i>
                            </button>
                            <ul class="dropdown-menu">
                                <li><a class="dropdown-item" href="#" onclick="app.openChat('${contact.id}', '${displayName}')">
                                    <i class="bi bi-chat me-2"></i>Open Chat
                                </a></li>
                                <li><a class="dropdown-item" href="#" onclick="app.blockContact('${contact.id}')">
                                    <i class="bi bi-slash-circle me-2"></i>Block
                                </a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    filterContacts() {
        const searchTerm = document.getElementById('contacts-search').value.toLowerCase();
        const contacts = document.querySelectorAll('.contact-card');
        
        contacts.forEach(contact => {
            const name = contact.querySelector('.contact-name').textContent.toLowerCase();
            const phone = contact.querySelector('.contact-phone').textContent.toLowerCase();
            
            if (name.includes(searchTerm) || phone.includes(searchTerm)) {
                contact.style.display = 'block';
            } else {
                contact.style.display = 'none';
            }
        });
    }

    async checkNumber() {
        const phone = document.getElementById('check-phone').value.trim();
        const session = document.getElementById('check-session-select').value;
        
        if (!phone || !session) {
            this.showToast('Please enter phone number and select session', 'warning');
            return;
        }

        try {
            const result = await this.apiCall(`/api/contacts/${session}/check/${phone}`);
            if (result.success) {
                const resultDiv = document.getElementById('check-result');
                const exists = result.data.numberExists;
                
                resultDiv.innerHTML = `
                    <div class="alert ${exists ? 'alert-success' : 'alert-warning'}">
                        <i class="bi bi-${exists ? 'check-circle' : 'exclamation-triangle'} me-2"></i>
                        Number ${exists ? 'exists' : 'does not exist'} on WhatsApp
                    </div>
                `;
            }
        } catch (error) {
            this.showToast('Failed to check number', 'error');
        }
    }

    async blockContact(contactId) {
        const session = document.getElementById('contacts-session-select').value;
        
        if (!session) {
            this.showToast('Please select a session', 'warning');
            return;
        }

        try {
            await this.apiCall('/api/contacts/block', {
                method: 'POST',
                body: JSON.stringify({ contactId, session })
            });
            this.showToast('Contact blocked', 'success');
        } catch (error) {
            this.showToast('Failed to block contact', 'error');
        }
    }

    openChat(contactId, contactName) {
        // Switch to chats section and select the contact
        this.showSection('chats');
        document.getElementById('chat-session-select').value = document.getElementById('contacts-session-select').value;
        this.loadChats();
        
        setTimeout(() => {
            this.selectChat(contactId, contactName);
        }, 1000);
    }

    // ==================== GROUP MANAGEMENT ====================
    
    async loadGroups() {
        const sessionSelect = document.getElementById('groups-session-select');
        const session = sessionSelect.value;
        
        if (!session) {
            document.getElementById('groups-empty').style.display = 'block';
            document.getElementById('groups-list').innerHTML = '';
            return;
        }

        try {
            const result = await this.apiCall(`/api/groups/${session}`);
            if (result.success) {
                // The groups already have participants in groupMetadata.participants
                const groupsWithFixedStructure = result.data.map(group => ({
                    id: group.id?._serialized || group.id,
                    name: group.name || group.groupMetadata?.subject || 'Unnamed Group',
                    participants: group.groupMetadata?.participants || [],
                    isGroup: group.isGroup,
                    timestamp: group.timestamp
                }));
                this.displayGroups(groupsWithFixedStructure);
            }
        } catch (error) {
            this.showToast('Failed to load groups', 'error');
        }
    }

    displayGroups(groups) {
        const container = document.getElementById('groups-list');
        const emptyState = document.getElementById('groups-empty');
        
        if (groups.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        container.innerHTML = groups.map(group => {
            // Fix: participants might be an array or might need to be fetched
            const participantCount = group.participants?.length || group.participantCount || 0;
            
            return `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="card group-card">
                        <div class="card-body">
                            <div class="d-flex align-items-center mb-3">
                                <div class="group-avatar me-3">
                                    <i class="bi bi-people-fill"></i>
                                </div>
                                <div class="flex-grow-1">
                                    <h6 class="card-title mb-1">${group.name}</h6>
                                    <small class="text-muted">${participantCount} members</small>
                                </div>
                            </div>
                            
                            <div class="d-flex justify-content-between">
                                <button class="btn btn-sm btn-primary" onclick="app.openChat('${group.id}', '${group.name}')">
                                    <i class="bi bi-chat me-1"></i>Open
                                </button>
                                <div class="dropdown">
                                    <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                                        <i class="bi bi-three-dots"></i>
                                    </button>
                                    <ul class="dropdown-menu">
                                        <li><a class="dropdown-item" href="#" onclick="app.exportGroupParticipants('${group.id}', '${group.name}')">
                                            <i class="bi bi-download me-2"></i>Export Participants
                                        </a></li>
                                        <li><hr class="dropdown-divider"></li>
                                        <li><a class="dropdown-item" href="#" onclick="app.leaveGroup('${group.id}')">
                                            <i class="bi bi-box-arrow-right me-2"></i>Leave Group
                                        </a></li>
                                        <li><a class="dropdown-item text-danger" href="#" onclick="app.deleteGroup('${group.id}')">
                                            <i class="bi bi-trash me-2"></i>Delete Group
                                        </a></li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async createGroup() {
        const name = document.getElementById('group-name').value.trim();
        const session = document.getElementById('group-session-select').value;
        const participantsText = document.getElementById('group-participants').value.trim();
        
        if (!name || !session || !participantsText) {
            this.showToast('Please fill all fields', 'warning');
            return;
        }

        const participants = participantsText.split('\n')
            .map(p => p.trim())
            .filter(p => p.length > 0);

        try {
            await this.apiCall(`/api/groups/${session}`, {
                method: 'POST',
                body: JSON.stringify({ name, participants })
            });
            
            this.showToast('Group created successfully', 'success');
            document.getElementById('group-name').value = '';
            document.getElementById('group-participants').value = '';
            this.loadGroups();
        } catch (error) {
            this.showToast('Failed to create group', 'error');
        }
    }

    async leaveGroup(groupId) {
        const session = document.getElementById('groups-session-select').value;
        
        if (!confirm('Are you sure you want to leave this group?')) {
            return;
        }

        try {
            await this.apiCall(`/api/groups/${session}/${groupId}/leave`, { method: 'POST' });
            this.showToast('Left group successfully', 'success');
            this.loadGroups();
        } catch (error) {
            this.showToast('Failed to leave group', 'error');
        }
    }

    async deleteGroup(groupId) {
        const session = document.getElementById('groups-session-select').value;
        
        if (!confirm('Are you sure you want to delete this group?')) {
            return;
        }

        try {
            await this.apiCall(`/api/groups/${session}/${groupId}`, { method: 'DELETE' });
            this.showToast('Group deleted successfully', 'success');
            this.loadGroups();
        } catch (error) {
            this.showToast('Failed to delete group', 'error');
        }
    }
    
    async exportGroupParticipants(groupId, groupName) {
        const session = document.getElementById('groups-session-select').value;
        
        if (!session) {
            this.showToast('Please select a session first', 'warning');
            return;
        }
        
        // Show loading toast
        this.showToast('Exporting participants... This may take a moment', 'info');
        
        try {
            const response = await this.apiCall(`/api/groups/${session}/${groupId}/export`);
            
            if (response.success && response.data) {
                const exportData = response.data;
                
                // Download JSON file
                if (exportData.json_url) {
                    const jsonLink = document.createElement('a');
                    jsonLink.href = `/static${exportData.json_url}`;
                    jsonLink.download = `${groupName}_participants.json`;
                    jsonLink.click();
                }
                
                // Download Excel file with a small delay
                setTimeout(() => {
                    if (exportData.excel_url) {
                        const excelLink = document.createElement('a');
                        excelLink.href = `/static${exportData.excel_url}`;
                        excelLink.download = `${groupName}_participants.xlsx`;
                        excelLink.click();
                    }
                }, 500);
                
                // Download CSV file with a small delay
                setTimeout(() => {
                    if (exportData.csv_url) {
                        const csvLink = document.createElement('a');
                        csvLink.href = `/static${exportData.csv_url}`;
                        csvLink.download = `${groupName}_participants.csv`;
                        csvLink.click();
                    }
                }, 1000);
                
                this.showToast(
                    `Successfully exported ${exportData.participant_count} participants!`, 
                    'success'
                );
            } else {
                throw new Error('Invalid export response');
            }
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Failed to export participants: ' + error.message, 'error');
        }
    }

    // ==================== MESSAGING ====================
    
    async sendTextMessage() {
        const session = document.getElementById('message-session-select').value;
        const chatId = document.getElementById('message-chat-id').value.trim();
        const text = document.getElementById('message-text').value.trim();
        
        if (!session || !chatId || !text) {
            this.showToast('Please fill all fields', 'warning');
            return;
        }

        try {
            const result = await this.apiCall('/api/messages/text', {
                method: 'POST',
                body: JSON.stringify({ session, chatId, text })
            });
            
            if (result.success) {
                this.showToast('Message sent successfully', 'success');
                document.getElementById('message-text').value = '';
                this.updateMessageStatus('Text message sent', 'success');
            }
        } catch (error) {
            this.showToast('Failed to send message', 'error');
            this.updateMessageStatus('Failed to send message', 'error');
        }
    }

    async sendFileMessage() {
        const session = document.getElementById('message-session-select').value;
        const chatId = document.getElementById('message-chat-id').value.trim();
        const fileInput = document.getElementById('message-file');
        const caption = document.getElementById('file-caption').value.trim();
        
        if (!session || !chatId || !fileInput.files[0]) {
            this.showToast('Please fill all fields and select a file', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('chatId', chatId);
        formData.append('session', session);
        formData.append('caption', caption);

        try {
            const result = await this.apiCall('/api/messages/file', {
                method: 'POST',
                body: formData,
                headers: {} // Remove Content-Type to let browser set it with boundary
            });
            
            if (result.success) {
                this.showToast('File sent successfully', 'success');
                fileInput.value = '';
                document.getElementById('file-caption').value = '';
                this.updateMessageStatus('File message sent', 'success');
            }
        } catch (error) {
            this.showToast('Failed to send file', 'error');
            this.updateMessageStatus('Failed to send file', 'error');
        }
    }

    async sendLocationMessage() {
        const session = document.getElementById('message-session-select').value;
        const chatId = document.getElementById('message-chat-id').value.trim();
        const latitude = parseFloat(document.getElementById('location-lat').value);
        const longitude = parseFloat(document.getElementById('location-lng').value);
        const title = document.getElementById('location-title').value.trim();
        
        if (!session || !chatId || isNaN(latitude) || isNaN(longitude)) {
            this.showToast('Please fill all required fields', 'warning');
            return;
        }

        try {
            const result = await this.apiCall('/api/messages/location', {
                method: 'POST',
                body: JSON.stringify({ session, chatId, latitude, longitude, title })
            });
            
            if (result.success) {
                this.showToast('Location sent successfully', 'success');
                document.getElementById('location-lat').value = '';
                document.getElementById('location-lng').value = '';
                document.getElementById('location-title').value = '';
                this.updateMessageStatus('Location message sent', 'success');
            }
        } catch (error) {
            this.showToast('Failed to send location', 'error');
            this.updateMessageStatus('Failed to send location', 'error');
        }
    }

    updateMessageStatus(message, type) {
        const statusElement = document.getElementById('message-status');
        const iconClass = type === 'success' ? 'bi-check-circle text-success' : 'bi-x-circle text-danger';
        
        statusElement.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="bi ${iconClass} me-2"></i>
                <span>${message}</span>
            </div>
            <small class="text-muted">${new Date().toLocaleTimeString()}</small>
        `;
    }

    // ==================== WHATSAPP WARMER ====================
    
    async loadWarmerSessions() {
        try {
            const response = await this.apiCall('/api/warmer/list');
            this.displayWarmerSessions(response);
        } catch (error) {
            console.error('Error loading warmer sessions:', error);
            // Show empty state
            const container = document.getElementById('warmer-sessions-list');
            if (container) {
                container.innerHTML = `
                    <div class="text-center text-muted py-5">
                        <i class="bi bi-fire display-1"></i>
                        <p class="mt-3">No warmer sessions created yet</p>
                        <button class="btn btn-danger" onclick="showCreateWarmerModal()">
                            <i class="bi bi-plus-circle me-2"></i>Create First Warmer
                        </button>
                    </div>
                `;
            }
        }
    }
    
    displayWarmerSessions(warmers) {
        const container = document.getElementById('warmer-sessions-list');
        if (!container) return;
        
        if (!warmers || warmers.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-fire display-1"></i>
                    <p class="mt-3">No warmer sessions created yet</p>
                    <button class="btn btn-danger" onclick="showCreateWarmerModal()">
                        <i class="bi bi-plus-circle me-2"></i>Create First Warmer
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = warmers.map(warmer => `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card warmer-card ${warmer.is_active ? 'active' : ''}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <h6 class="card-title mb-0">
                                <i class="bi bi-fire text-danger me-2"></i>${warmer.name}
                            </h6>
                            <span class="badge bg-${warmer.is_active ? 'success' : 'secondary'}">
                                ${warmer.status}
                            </span>
                        </div>
                        
                        <div class="warmer-stats mb-3">
                            <div class="row">
                                <div class="col-6">
                                    <small class="text-muted">Sessions:</small>
                                    <div class="fw-bold">${warmer.sessions ? warmer.sessions.length : 0}</div>
                                </div>
                                <div class="col-6">
                                    <small class="text-muted">Messages:</small>
                                    <div class="fw-bold">${warmer.statistics?.total_messages || 0}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="d-flex gap-2">
                            ${warmer.is_active ? `
                                <button class="btn btn-sm btn-warning" onclick="stopWarmer(${warmer.id})">
                                    <i class="bi bi-pause-fill"></i> Stop
                                </button>
                            ` : `
                                <button class="btn btn-sm btn-success" onclick="startWarmer(${warmer.id})">
                                    <i class="bi bi-play-fill"></i> Start
                                </button>
                            `}
                            <button class="btn btn-sm btn-primary" onclick="showJoinGroupsModal(${warmer.id})">
                                <i class="bi bi-link-45deg"></i> Join Groups
                            </button>
                            <button class="btn btn-sm btn-info" onclick="viewWarmerMetrics(${warmer.id})">
                                <i class="bi bi-graph-up"></i> Metrics
                            </button>
                            ${!warmer.is_active ? `
                                <button class="btn btn-sm btn-danger" onclick="deleteWarmer(${warmer.id})">
                                    <i class="bi bi-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    async showCreateWarmerModal() {
        // Load available sessions for warmer
        try {
            const result = await this.apiCall('/api/sessions');
            if (result.success) {
                const workingSessions = result.data.filter(s => s.status === 'WORKING');
                const checkboxContainer = document.getElementById('warmer-session-checkboxes');
                
                if (!checkboxContainer) return;
                
                if (workingSessions.length < 2) {
                    checkboxContainer.innerHTML = `
                        <div class="alert alert-warning">
                            <i class="bi bi-exclamation-triangle me-2"></i>
                            You need at least 2 working sessions to create a warmer. 
                            Currently you have ${workingSessions.length} working session(s).
                        </div>
                    `;
                    return;
                }
                
                checkboxContainer.innerHTML = workingSessions.map((session, index) => `
                    <div class="d-flex align-items-center mb-2 p-2" style="background: #f8f9fa; border-radius: 5px;">
                        <input class="form-check-input warmer-session-checkbox me-2" 
                               type="checkbox" 
                               value="${session.name}" 
                               id="warmer-session-${session.name}"
                               style="width: 20px; height: 20px; min-width: 20px; cursor: pointer; margin: 0;">
                        <label class="form-check-label mb-0" for="warmer-session-${session.name}" style="cursor: pointer; font-weight: 500; flex-grow: 1;">
                            ${session.name} ${index === 0 ? '<span class="badge bg-primary ms-2">Will be orchestrator</span>' : ''}
                        </label>
                    </div>
                `).join('');
                
                // Show modal
                const modal = new bootstrap.Modal(document.getElementById('createWarmerModal'));
                modal.show();
            }
        } catch (error) {
            this.showToast('Failed to load sessions', 'error');
        }
    }
    
    async createWarmerSession() {
        const name = document.getElementById('warmer-name').value.trim();
        const selectedSessions = Array.from(document.querySelectorAll('.warmer-session-checkbox:checked'))
            .map(cb => cb.value);
        
        if (!name) {
            this.showToast('Please enter a name for the warmer session', 'warning');
            return;
        }
        
        if (selectedSessions.length < 2) {
            this.showToast('Please select at least 2 sessions for warming', 'warning');
            return;
        }
        
        const groupDelayMin = parseInt(document.getElementById('group-delay-min').value) || 30;
        const groupDelayMax = parseInt(document.getElementById('group-delay-max').value) || 300;
        const directDelayMin = parseInt(document.getElementById('direct-delay-min').value) || 120;
        const directDelayMax = parseInt(document.getElementById('direct-delay-max').value) || 600;
        
        try {
            const warmerData = {
                name: name,
                orchestrator_session: selectedSessions[0],
                participant_sessions: selectedSessions.slice(1),
                config: {
                    group_message_delay_min: groupDelayMin,
                    group_message_delay_max: groupDelayMax,
                    direct_message_delay_min: directDelayMin,
                    direct_message_delay_max: directDelayMax
                }
            };
            
            const response = await this.apiCall('/api/warmer/create', {
                method: 'POST',
                body: JSON.stringify(warmerData)
            });
            
            if (response.success) {
                this.showToast('Warmer session created successfully!', 'success');
                
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('createWarmerModal'));
                if (modal) modal.hide();
                
                // Reset form
                document.getElementById('warmer-name').value = '';
                document.querySelectorAll('.warmer-session-checkbox').forEach(cb => cb.checked = false);
                
                // Reload warmer sessions
                this.loadWarmerSessions();
            } else {
                throw new Error(response.error || 'Failed to create warmer session');
            }
        } catch (error) {
            console.error('Error creating warmer:', error);
            this.showToast('Failed to create warmer session: ' + error.message, 'error');
        }
    }
    
    async startWarmer(warmerId) {
        try {
            // First check group status
            const groupCheck = await this.apiCall(`/api/warmer/${warmerId}/groups/check`);
            
            if (!groupCheck.has_enough_groups) {
                // Need more groups, show modal
                this.showJoinGroupsModalForStart(warmerId, groupCheck);
            } else {
                // Have enough groups, start warmer directly
                const response = await this.apiCall(`/api/warmer/${warmerId}/start`, {
                    method: 'POST'
                });
                
                if (response.success) {
                    this.showToast(response.message || 'Warmer started successfully', 'success');
                    this.loadWarmerSessions();
                } else {
                    throw new Error(response.error || 'Failed to start warmer');
                }
            }
        } catch (error) {
            console.error('Error starting warmer:', error);
            this.showToast('Failed to start warmer: ' + error.message, 'error');
        }
    }
    
    async stopWarmer(warmerId) {
        if (!confirm('Are you sure you want to stop this warmer session?')) {
            return;
        }
        
        try {
            const response = await this.apiCall(`/api/warmer/${warmerId}/stop`, {
                method: 'POST'
            });
            
            if (response.success) {
                this.showToast(response.message || 'Warmer stopped successfully', 'success');
                this.loadWarmerSessions();
            } else {
                throw new Error(response.error || 'Failed to stop warmer');
            }
        } catch (error) {
            console.error('Error stopping warmer:', error);
            this.showToast('Failed to stop warmer: ' + error.message, 'error');
        }
    }
    
    async deleteWarmer(warmerId) {
        if (!confirm('Are you sure you want to delete this warmer session? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await this.apiCall(`/api/warmer/${warmerId}`, {
                method: 'DELETE'
            });
            
            if (response.success) {
                this.showToast('Warmer session deleted successfully', 'success');
                this.loadWarmerSessions();
            } else {
                throw new Error(response.error || 'Failed to delete warmer');
            }
        } catch (error) {
            console.error('Error deleting warmer:', error);
            this.showToast('Failed to delete warmer: ' + error.message, 'error');
        }
    }
    
    async viewWarmerMetrics(warmerId) {
        try {
            const response = await this.apiCall(`/api/warmer/${warmerId}/metrics`);
            
            // Update metrics display
            const metricsContainer = document.getElementById('warmer-metrics');
            if (metricsContainer && response) {
                metricsContainer.innerHTML = `
                    <h5 class="mb-3">${response.name} - Metrics</h5>
                    <div class="row">
                        <div class="col-md-4">
                            <div class="metric-card">
                                <div class="metric-value">${response.statistics.total_messages}</div>
                                <div class="metric-label">Total Messages</div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="metric-card">
                                <div class="metric-value">${response.statistics.active_groups}</div>
                                <div class="metric-label">Active Groups</div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="metric-card">
                                <div class="metric-value">${response.statistics.message_rate_per_minute}</div>
                                <div class="metric-label">Messages/Min</div>
                            </div>
                        </div>
                    </div>
                    <div class="row mt-3">
                        <div class="col-md-6">
                            <small class="text-muted">Group Messages:</small> ${response.statistics.group_messages}<br>
                            <small class="text-muted">Direct Messages:</small> ${response.statistics.direct_messages}
                        </div>
                        <div class="col-md-6">
                            <small class="text-muted">Duration:</small> ${response.statistics.duration_minutes} minutes<br>
                            <small class="text-muted">Groups Created:</small> ${response.statistics.groups_created}
                        </div>
                    </div>
                `;
            }
            
            // Update recent conversations
            const conversationsContainer = document.getElementById('warmer-conversations');
            if (conversationsContainer && response.recent_conversations) {
                conversationsContainer.innerHTML = response.recent_conversations.map(conv => `
                    <div class="conversation-item">
                        <div class="d-flex justify-content-between">
                            <strong>${conv.sender}</strong>
                            <span class="badge bg-${conv.type === 'group' ? 'primary' : 'info'}">${conv.type}</span>
                        </div>
                        <div class="text-muted">${conv.message}</div>
                        <small class="text-muted">${new Date(conv.sent_at).toLocaleTimeString()}</small>
                    </div>
                `).join('');
            }
            
        } catch (error) {
            console.error('Error loading warmer metrics:', error);
            this.showToast('Failed to load warmer metrics', 'error');
        }
    }
    
    showJoinGroupsModal(warmerId) {
        // This is for manual join groups button - always shows 5 inputs
        this.apiCall(`/api/warmer/${warmerId}/groups/check`).then(groupCheck => {
            this.showJoinGroupsModalWithCount(warmerId, 5, groupCheck);
        });
    }
    
    showJoinGroupsModalForStart(warmerId, groupCheck) {
        // This is called from start warmer - shows only needed inputs
        const groupsNeeded = groupCheck.groups_needed;
        this.showJoinGroupsModalWithCount(warmerId, groupsNeeded, groupCheck, true);
    }
    
    showJoinGroupsModalWithCount(warmerId, inputCount, groupCheck, isForStart = false) {
        // Store the warmer ID and count
        document.getElementById('join-groups-warmer-id').value = warmerId;
        document.getElementById('join-groups-needed').value = inputCount;
        
        // Update the info message
        const messageElement = document.getElementById('join-groups-message');
        if (isForStart) {
            messageElement.innerHTML = `
                <strong>Groups needed to start warmer:</strong><br>
                Currently ${groupCheck.common_groups_count} common groups found. 
                Need ${groupCheck.groups_needed} more groups to reach the minimum of 5.
            `;
        } else {
            messageElement.innerHTML = `
                <strong>Join Groups:</strong><br>
                Currently ${groupCheck.common_groups_count} common groups found. 
                You can add up to ${inputCount} more groups.
            `;
        }
        
        // Generate dynamic inputs
        const container = document.getElementById('group-links-container');
        container.innerHTML = '';
        
        for (let i = 1; i <= inputCount; i++) {
            const inputDiv = document.createElement('div');
            inputDiv.className = 'mb-3';
            inputDiv.innerHTML = `
                <label class="form-label">Group Invite Link ${i}</label>
                <input type="url" class="form-control group-link-input" 
                       placeholder="https://chat.whatsapp.com/..." required>
            `;
            container.appendChild(inputDiv);
        }
        
        // Update button text
        const joinBtn = document.getElementById('join-groups-btn');
        if (isForStart) {
            joinBtn.innerHTML = '<i class="bi bi-play-fill me-2"></i>Join Groups & Start Warmer';
            joinBtn.setAttribute('data-start-after', 'true');
        } else {
            joinBtn.innerHTML = '<i class="bi bi-link-45deg me-2"></i>Join Groups';
            joinBtn.setAttribute('data-start-after', 'false');
        }
        
        // Reset progress
        document.getElementById('join-groups-progress').style.display = 'none';
        document.querySelector('#join-groups-progress .progress-bar').style.width = '0%';
        joinBtn.disabled = false;
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('joinGroupsModal'));
        modal.show();
    }
    
    async joinGroupsForWarmer() {
        const warmerId = document.getElementById('join-groups-warmer-id').value;
        const linkInputs = document.querySelectorAll('.group-link-input');
        const inviteLinks = [];
        const shouldStartAfter = document.getElementById('join-groups-btn').getAttribute('data-start-after') === 'true';
        
        // Validate and collect links
        for (let input of linkInputs) {
            const link = input.value.trim();
            if (!link) {
                this.showToast(`Please provide all ${linkInputs.length} group invite links`, 'warning');
                return;
            }
            if (!link.startsWith('https://chat.whatsapp.com/')) {
                this.showToast('All links must be valid WhatsApp group invite links', 'warning');
                return;
            }
            inviteLinks.push(link);
        }
        
        // Disable button and show progress
        document.getElementById('join-groups-btn').disabled = true;
        document.getElementById('join-groups-progress').style.display = 'block';
        document.getElementById('join-groups-status').textContent = 'Joining groups...';
        
        try {
            const response = await this.apiCall(`/api/warmer/${warmerId}/join-groups`, {
                method: 'POST',
                body: JSON.stringify({ invite_links: inviteLinks })
            });
            
            if (response.success) {
                // Update progress to 50%
                document.querySelector('#join-groups-progress .progress-bar').style.width = '50%';
                document.getElementById('join-groups-status').textContent = 'Successfully joined groups!';
                
                if (shouldStartAfter) {
                    // Continue to start the warmer
                    document.getElementById('join-groups-status').textContent = 'Starting warmer...';
                    document.querySelector('#join-groups-progress .progress-bar').style.width = '75%';
                    
                    const startResponse = await this.apiCall(`/api/warmer/${warmerId}/start`, {
                        method: 'POST'
                    });
                    
                    if (startResponse.success) {
                        document.querySelector('#join-groups-progress .progress-bar').style.width = '100%';
                        document.getElementById('join-groups-status').textContent = 'Warmer started successfully!';
                        this.showToast('Groups joined and warmer started successfully!', 'success');
                    } else {
                        throw new Error(startResponse.error || 'Failed to start warmer after joining groups');
                    }
                } else {
                    // Just joined groups
                    document.querySelector('#join-groups-progress .progress-bar').style.width = '100%';
                    this.showToast(response.message || 'Groups joined successfully!', 'success');
                }
                
                // Close modal after delay
                setTimeout(() => {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('joinGroupsModal'));
                    if (modal) modal.hide();
                    
                    // Reload warmer sessions
                    this.loadWarmerSessions();
                }, 2000);
            } else {
                throw new Error(response.error || 'Failed to join groups');
            }
        } catch (error) {
            console.error('Error joining groups:', error);
            this.showToast('Failed: ' + error.message, 'error');
            
            // Re-enable button
            document.getElementById('join-groups-btn').disabled = false;
            document.getElementById('join-groups-progress').style.display = 'none';
        }
    }

    // ==================== NAVIGATION ====================
    
    showSection(sectionName) {
        // Hide all sections
        const sections = ['sessions', 'chats', 'contacts', 'groups', 'campaigns', 'analytics', 'warmer'];
        sections.forEach(section => {
            const sectionElement = document.getElementById(`${section}-section`);
            if (sectionElement) {
                sectionElement.style.display = 'none';
            }
        });
        
        // Show selected section
        const targetSection = document.getElementById(`${sectionName}-section`);
        if (targetSection) {
            targetSection.style.display = 'block';
        }
        
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        // Add active class to clicked link
        if (event && event.target) {
            event.target.classList.add('active');
        }
        
        // Load section data
        switch (sectionName) {
            case 'chats':
                this.loadChats();
                break;
            case 'contacts':
                this.loadContacts();
                break;
            case 'groups':
                this.loadGroups();
                break;
            case 'campaigns':
                this.loadCampaigns();
                this.loadProcessingStatus();
                break;
            case 'analytics':
                this.loadAnalytics();
                break;
            case 'warmer':
                this.loadWarmerSessions();
                break;
        }
    }

    refreshData() {
        this.checkServerStatus();
        this.loadSessions();
        
        const currentSection = document.querySelector('[id$="-section"]:not([style*="display: none"])');
        if (currentSection) {
            const sectionName = currentSection.id.replace('-section', '');
            switch (sectionName) {
                case 'chats':
                    this.loadChats();
                    break;
                case 'contacts':
                    this.loadContacts();
                    break;
                case 'groups':
                    this.loadGroups();
                    break;
                case 'campaigns':
                    this.loadCampaigns();
                    this.loadProcessingStatus();
                    break;
                case 'analytics':
                    this.loadAnalytics();
                    break;
                case 'warmer':
                    this.loadWarmerSessions();
                    break;
            }
        }
    }
}

// Global functions for HTML onclick events
window.showSection = function(section) {
    // Get the event from the global window.event (for onclick handlers)
    const clickEvent = window.event || event;
    // Temporarily store the event so showSection can access it
    const originalEvent = window.event;
    window.event = clickEvent;
    app.showSection(section);
    window.event = originalEvent;
};
window.createSession = () => app.createSession();
window.loadSessions = () => app.loadSessions();
window.loadChats = () => app.loadChats();
window.loadContacts = () => app.loadContacts();
window.loadGroups = () => app.loadGroups();
window.filterContacts = () => app.filterContacts();
window.checkNumber = () => app.checkNumber();
window.createGroup = () => app.createGroup();
window.exportGroupParticipants = (groupId, groupName) => app.exportGroupParticipants(groupId, groupName);
window.sendTextMessage = () => app.sendTextMessage();
window.sendFileMessage = () => app.sendFileMessage();
window.sendLocationMessage = () => app.sendLocationMessage();
window.refreshData = () => app.refreshData();

// Phase 2: Campaign Management Functions
window.loadCampaigns = () => app.loadCampaigns();
window.selectCampaign = (id) => app.selectCampaign(id);
window.startCampaign = (id) => app.startCampaign(id);
window.pauseCampaign = (id) => app.pauseCampaign(id);
window.resumeCampaign = (id) => app.resumeCampaign(id);
window.stopCampaign = (id) => app.stopCampaign(id);
window.deleteCampaign = (id) => app.deleteCampaign(id);
window.viewCampaignReport = (id) => app.showToast('Campaign report feature coming soon!', 'info');

// Modal Campaign Wizard Functions
window.modalNextStep = () => app.modalNextStep();
window.modalPrevStep = () => app.modalPrevStep();
window.handleModalFileUpload = () => app.handleModalFileUpload();
window.toggleModalMessageMode = () => app.toggleModalMessageMode();
window.addModalSample = () => app.addModalSample();
window.removeModalSample = (btn) => app.removeModalSample(btn);
window.launchModalCampaign = () => app.launchModalCampaign();
window.saveModalCampaignDraft = () => app.saveModalCampaignDraft();
window.previewModalTemplate = () => app.previewModalTemplate();

// WhatsApp Warmer Functions
window.loadWarmerSessions = () => app.loadWarmerSessions();
window.showCreateWarmerModal = () => app.showCreateWarmerModal();
window.createWarmerSession = () => app.createWarmerSession();
window.startWarmer = (id) => app.startWarmer(id);
window.stopWarmer = (id) => app.stopWarmer(id);
window.deleteWarmer = (id) => app.deleteWarmer(id);
window.viewWarmerMetrics = (id) => app.viewWarmerMetrics(id);
window.showJoinGroupsModal = (id) => app.showJoinGroupsModal(id);
window.showJoinGroupsModalForStart = (id, groupCheck) => app.showJoinGroupsModalForStart(id, groupCheck);
window.joinGroupsForWarmer = () => app.joinGroupsForWarmer();

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    try {
        app = new WhatsAppAgent();
        console.log('WhatsApp Agent initialized successfully');
    } catch (error) {
        console.error('Error initializing WhatsApp Agent:', error);
        // Show error to user
        document.body.innerHTML = `
            <div class="container mt-5">
                <div class="alert alert-danger">
                    <h4>Error Loading Application</h4>
                    <p>There was an error initializing the application. Please check the console for details.</p>
                    <pre>${error.message}</pre>
                </div>
            </div>
        `;
    }
});