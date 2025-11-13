// =========================================================
// CONFIGURAÇÃO E FUNÇÕES DE UTILIDADE
// =========================================================
const CHAT_HISTORY_KEY = 'chatHistory';

// Função utilitária para adicionar mensagens à interface e ao histórico
function addMessageToChat(role, content) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    messageDiv.innerHTML = content; // Permite formatação em Markdown na resposta
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Adiciona ao histórico do agente
    agent.chatHistory.push({ role: role, content: content });
    
    // Salva no localStorage para cache rápido
    agent.saveLocalHistory();
}

// =========================================================
// CLASSE PRINCIPAL: AGENTMANAGER
// =========================================================
class AgentManager { 
    constructor() {
        this.chatHistory = [];
        this.apiUrl = '/.netlify/functions/agent';
        // ✅ ENDPOINT DE CARREGAMENTO DO DB
        this.historyApiUrl = '/.netlify/functions/getChatHistory'; 
        // ✅ NOVO ENDPOINT DE SALVAMENTO DE HISTÓRICO
        this.saveHistoryApiUrl = '/.netlify/functions/saveChatHistory'; 
        this.selectedAgentId = 1; // ID padrão
        this.agentsList = []; // Para armazenar a lista completa
        
        // Listener para a seleção de agente
        document.getElementById('agent-select').addEventListener('change', async (e) => {
            this.selectedAgentId = e.target.value; 
            
            const user = netlifyIdentity.currentUser();
            
            // 1. Carrega o histórico (tentando DB se localStorage falhar)
            if (user) {
                await this.loadHistory(user); 
            } else {
                this.chatHistory = [];
            }

            const selectedName = e.target.options[e.target.selectedIndex].textContent;
            
            // 2. Exibe o histórico
            this.displayChatHistory(); 

            // Mensagem de status após carregar o histórico
            const chatMessages = document.getElementById('chat-messages');
            const statusDiv = document.createElement('div');
            statusDiv.className = 'message assistant-message';
            const statusText = this.chatHistory.length > 0 
                ? `Agente **${selectedName}** selecionado. Histórico de **${this.chatHistory.length}** mensagens carregado.`
                : `Agente **${selectedName}** selecionado. Novo chat iniciado.`;
            statusDiv.innerHTML = statusText;
            chatMessages.appendChild(statusDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            this.controlAgentButtons(parseInt(this.selectedAgentId));
            this.updateCreatorInfo(); 
            this.updateAgentInfo();
            this.hideForm(); // Esconde o formulário ao trocar de agente
        });
    }

    // =========================================================
    // MÉTODOS DE PERSISTÊNCIA (DB e LocalStorage)
    // =========================================================

    // Salva o histórico no LocalStorage (cache rápido)
    saveLocalHistory() {
        try {
            localStorage.setItem(`${CHAT_HISTORY_KEY}-${this.selectedAgentId}`, JSON.stringify(this.chatHistory));
        } catch (e) {
            console.error('Erro ao salvar no LocalStorage:', e);
        }
    }
    
    // ✅ NOVO MÉTODO: Salva o histórico de chat no MongoDB
    async saveHistory(user) {
        if (!user || !user.email) {
            console.error('Usuário não logado, impossível salvar histórico no DB.');
            return;
        }

        try {
            const response = await fetch(this.saveHistoryApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token.access_token}`
                },
                body: JSON.stringify({
                    agentId: parseInt(this.selectedAgentId),
                    chatHistory: this.chatHistory
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Erro ao salvar histórico no DB:', errorData.error);
            } else {
                 console.log(`Histórico salvo com sucesso no DB para Agente ${this.selectedAgentId}.`);
            }
        } catch (error) {
            console.error('Erro de rede ao salvar histórico no DB:', error);
        }
    }
    
    // ✅ MÉTODO MODIFICADO: Tenta LocalStorage, se vazio, tenta DB
    async loadHistory(user) {
        // 1. Tenta carregar do LocalStorage (cache)
        try {
            const localHistory = localStorage.getItem(`${CHAT_HISTORY_KEY}-${this.selectedAgentId}`);
            if (localHistory) {
                this.chatHistory = JSON.parse(localHistory);
                return; // Se encontrou local, usa e sai
            }
        } catch (e) {
            // Se o LocalStorage estiver vazio ou inválido, continua para o DB
            console.warn('LocalStorage vazio ou inválido. Tentando carregar histórico do DB...');
        }
        
        // 2. Se LocalStorage falhou, tenta carregar do DB
        if (!user || !user.email) {
            this.chatHistory = [];
            return;
        }

        try {
            const response = await fetch(`${this.historyApiUrl}?agentId=${this.selectedAgentId}`, {
                headers: {
                    'Authorization': `Bearer ${user.token.access_token}`
                }
            });

            if (response.ok) {
                this.chatHistory = await response.json();
                // Salva o histórico do DB no LocalStorage para cache na próxima vez
                this.saveLocalHistory(); 
                console.log(`Histórico de ${this.chatHistory.length} mensagens carregado do DB.`);
            } else {
                // Se der 404/401, inicia um novo chat
                console.warn('Histórico não encontrado no DB. Iniciando novo chat.');
                this.chatHistory = [];
            }
        } catch (error) {
            console.error('Erro de rede ou função Netlify não encontrada:', error);
            this.chatHistory = [];
        }
    }
    
    // Exibe o histórico na interface
    displayChatHistory() {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = ''; 

        this.chatHistory.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.role}-message`;
            messageDiv.innerHTML = msg.content;
            chatMessages.appendChild(messageDiv);
        });

        chatMessages.scrollTop = chatMessages.scrollHeight;
    }


    // =========================================================
    // MÉTODOS DE AGENTE E ADMINISTRAÇÃO
    // =========================================================

    // Envia mensagem ao backend e recebe a resposta do agente
    async sendMessage(message) {
        const user = netlifyIdentity.currentUser();
        const token = user.token.access_token;
        const selectedAgent = this.agentsList.find(a => a.AgentID == this.selectedAgentId);

        if (!selectedAgent) {
            throw new Error("Agente não encontrado.");
        }

        const payload = {
            question: message,
            agentId: parseInt(this.selectedAgentId),
            // Mapeia o histórico para o formato que a API espera
            chatHistory: this.chatHistory.map(m => ({ role: m.role, content: m.content })),
            systemPrompt: selectedAgent.systemPrompt,
            shouldSearchPrompt: selectedAgent.shouldSearchPrompt
        };

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erro desconhecido do agente.');
        }

        const data = await response.json();
        return data.response;
    }

    // Carrega a lista de agentes do DB
    async loadAgentsList(user) {
        const select = document.getElementById('agent-select');
        select.innerHTML = '<option value="1">Carregando Agentes...</option>';

        if (!user) {
             this.agentsList = [{ AgentID: 1, AgentName: "Assistente Padrão (Sem Login)", agentFunction: "Assistente básico.", createdBy: "sistema", systemPrompt: "...", shouldSearchPrompt: "..." }];
        } else {
             try {
                const response = await fetch('/.netlify/functions/getAgents', {
                    headers: { 'Authorization': `Bearer ${user.token.access_token}` }
                });
                
                if (response.ok) {
                    this.agentsList = await response.json();
                } else {
                    console.error('Erro ao carregar lista de agentes do DB:', response.status);
                    this.agentsList = [{ AgentID: 1, AgentName: "Erro de Conexão", agentFunction: "Agente de fallback.", createdBy: "sistema", systemPrompt: "...", shouldSearchPrompt: "..." }];
                }
             } catch (error) {
                 console.error('Erro de rede ao carregar lista de agentes:', error);
                 this.agentsList = [{ AgentID: 1, AgentName: "Erro de Rede", agentFunction: "Agente de fallback.", createdBy: "sistema", systemPrompt: "...", shouldSearchPrompt: "..." }];
             }
        }
        
        // Preenche o <select>
        select.innerHTML = '';
        this.agentsList.forEach(agent => {
            const option = document.createElement('option');
            option.value = agent.AgentID;
            option.textContent = agent.AgentName;
            select.appendChild(option);
        });

        // Seleciona o agente correto (mantendo o selecionado ou o padrão)
        const initialAgent = this.agentsList.find(a => a.AgentID == this.selectedAgentId) || this.agentsList[0];
        if (initialAgent) {
             this.selectedAgentId = initialAgent.AgentID;
             select.value = this.selectedAgentId;
             
             // Carrega o histórico para o agente inicial
             await this.loadHistory(user); 
        }

        this.controlAgentButtons(parseInt(this.selectedAgentId));
        this.updateCreatorInfo(); 
        this.updateAgentInfo();
        
        return this.agentsList.length > 0;
    }

    // Atualiza o display de função
    updateAgentInfo() {
        const agent = this.agentsList.find(a => a.AgentID == this.selectedAgentId);
        const functionDisplay = document.getElementById('agent-function-display');
        if (functionDisplay) {
             functionDisplay.textContent = agent ? (agent.agentFunction || 'N/A') : 'Agente não carregado.';
        }
    }
    
    // Atualiza o display de e-mail do criador
    updateCreatorInfo() {
        const creatorSpan = document.getElementById('creator-email');
        const selectedAgent = this.agentsList.find(a => a.AgentID == this.selectedAgentId);
        if (creatorSpan) {
             creatorSpan.textContent = selectedAgent ? (selectedAgent.createdBy || 'Sistema') : 'N/A';
        }
    }

    // Controla a visibilidade dos botões Deletar/Editar
    controlAgentButtons(selectedId) {
        const deleteButton = document.getElementById('delete-agent-btn');
        const editButton = document.getElementById('edit-agent-btn');
        const user = netlifyIdentity.currentUser();

        const isStandardAgent = selectedId <= 1 || isNaN(selectedId);
        const isCreatedByCurrentUser = user && this.agentsList.find(a => a.AgentID == selectedId)?.createdBy === user.email;

        deleteButton.disabled = isStandardAgent || !isCreatedByCurrentUser;
        editButton.disabled = isStandardAgent || !isCreatedByCurrentUser;
    }

    // Esconde o formulário de criação/edição
    hideForm() {
         document.getElementById('agent-form-container').style.display = 'none';
    }
    
    // Preenche o formulário com dados do agente para edição
    fillAgentFormForEdit(agent) {
        document.getElementById('agent-id-input').value = agent.AgentID;
        document.getElementById('agent-name-input').value = agent.AgentName;
        document.getElementById('agent-function-input').value = agent.agentFunction;
        document.getElementById('system-prompt').value = agent.systemPrompt;
        document.getElementById('search-prompt').value = agent.shouldSearchPrompt;

        document.getElementById('agent-form-title').textContent = `Editar Agente: ${agent.AgentName}`;
        document.getElementById('save-agent-btn').textContent = 'Salvar Alterações';
        
        // Remove listeners antigos e adiciona o de edição
        const form = document.getElementById('agent-form');
        form.removeEventListener('submit', saveNewAgent); 
        form.removeEventListener('submit', updateExistingAgent); 
        form.addEventListener('submit', updateExistingAgent);
        
        document.getElementById('form-message').textContent = '';
        document.getElementById('agent-form-container').style.display = 'block';
    }
}

// Instância do Gerenciador
const agent = new AgentManager();

// =========================================================
// FUNÇÕES GLOBAIS DE CHAT E LÓGICA DE AGENTE
// =========================================================

// Função global para carregar a lista de agentes (usada em login/logout e DOMContentLoaded)
async function loadAgentsList() {
    const user = netlifyIdentity.currentUser();
    try {
        await agent.loadAgentsList(user);
        
        // Exibe o chat com o histórico carregado ou mensagem inicial
        const initialAgent = agent.agentsList.find(a => a.AgentID == agent.selectedAgentId) || { AgentName: 'Agente' };
        agent.displayChatHistory(false, initialAgent.AgentName);
    } catch (e) {
        console.error('Erro ao carregar lista de agentes:', e);
    }
}


// Função principal para envio de mensagem
async function sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value.trim();
    
    const user = netlifyIdentity.currentUser();

    if (!user) {
        alert('Por favor, faça login para enviar mensagens.');
        netlifyIdentity.open();
        return;
    }

    if (message) {
        addMessageToChat('user', message); // Adiciona e salva no cache local
        input.value = '';
        input.disabled = true;
        
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message assistant-message';
        loadingDiv.textContent = '💭 Pensando...';
        document.getElementById('chat-messages').appendChild(loadingDiv);
        
        try {
            // 1. Envia a mensagem e recebe a resposta
            const response = await agent.sendMessage(message);
            
            loadingDiv.remove();
            addMessageToChat('assistant', response); // Adiciona e salva no cache local
            
            // 2. ✅ NOVO PASSO: Salva o histórico persistente no DB
            await agent.saveHistory(user); 
            
        } catch (error) {
            loadingDiv.remove();
            addMessageToChat('assistant', `Erro ao processar sua mensagem: ${error.message}`);
            console.error(error);
        }
        
        input.disabled = false;
        input.focus();
    }
}


// =========================================================
// FUNÇÕES DE GERENCIAMENTO DE AGENTES (CRUD - Front-end)
// =========================================================

// Função para salvar um novo agente
async function saveNewAgent(e) { 
    e.preventDefault();
    const user = netlifyIdentity.currentUser();
    
    if (!user) { alert('Faça login para criar agentes.'); return; }
    
    const newAgentData = {
        AgentName: document.getElementById('agent-name-input').value,
        agentFunction: document.getElementById('agent-function-input').value,
        systemPrompt: document.getElementById('system-prompt').value,
        shouldSearchPrompt: document.getElementById('search-prompt').value,
        createdBy: user.email 
    };
    
    try {
        const response = await fetch('/.netlify/functions/createAgent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token.access_token}` },
            body: JSON.stringify(newAgentData)
        });
        
        const data = await response.json();
        if (response.ok) {
            document.getElementById('form-message').textContent = `Agente "${data.AgentName}" criado com sucesso!`;
            agent.hideForm();
            agent.selectedAgentId = data.AgentID; // Seleciona o novo agente
            await agent.loadAgentsList(user); // Recarrega a lista
        } else {
             document.getElementById('form-message').textContent = `Erro: ${data.error || 'Falha ao criar agente.'}`;
        }
    } catch (error) { 
        document.getElementById('form-message').textContent = 'Erro de rede ao criar agente.';
    }
}

// Função para atualizar um agente existente
async function updateExistingAgent(e) { 
    e.preventDefault();
    const user = netlifyIdentity.currentUser();

    if (!user) { alert('Faça login para editar agentes.'); return; }
    
    const updatedAgentData = {
        AgentID: document.getElementById('agent-id-input').value,
        AgentName: document.getElementById('agent-name-input').value,
        agentFunction: document.getElementById('agent-function-input').value,
        systemPrompt: document.getElementById('system-prompt').value,
        shouldSearchPrompt: document.getElementById('search-prompt').value,
    };
    
    try {
        const response = await fetch('/.netlify/functions/updateAgent', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token.access_token}` },
            body: JSON.stringify(updatedAgentData)
        });
        
        const data = await response.json();
        if (response.ok) {
            document.getElementById('form-message').textContent = `Agente "${data.AgentName}" atualizado com sucesso!`;
            agent.hideForm();
            await agent.loadAgentsList(user); // Recarrega a lista
        } else {
             document.getElementById('form-message').textContent = `Erro: ${data.error || 'Falha ao atualizar agente.'}`;
        }
    } catch (error) { 
        document.getElementById('form-message').textContent = 'Erro de rede ao atualizar agente.';
    }
}

// Função para deletar o agente selecionado
async function deleteSelectedAgent() {
    const user = netlifyIdentity.currentUser();
    const agentIdToDelete = agent.selectedAgentId;
    const agentName = agent.agentsList.find(a => a.AgentID == agentIdToDelete)?.AgentName || 'este agente';

    if (!user || agentIdToDelete <= 1 || !agent.agentsList.find(a => a.AgentID == agentIdToDelete)?.createdBy === user.email) {
        alert('Você não tem permissão para deletar este agente.');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja deletar o agente "${agentName}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/.netlify/functions/deleteAgent?agentId=${agentIdToDelete}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token.access_token}` }
        });

        if (response.ok) {
            alert(`Agente "${agentName}" deletado com sucesso.`);
            
            // Seleciona o agente padrão e recarrega a lista
            agent.selectedAgentId = 1;
            document.getElementById('agent-select').value = 1;
            await agent.loadAgentsList(user); 
        } else {
            const errorData = await response.json();
            alert(`Erro ao deletar: ${errorData.error || 'Erro de servidor.'}`);
        }
    } catch (error) {
        console.error('Erro de rede ao deletar agente:', error);
        alert('Erro de rede ao tentar deletar o agente.');
    }
}


// =========================================================
// INICIALIZAÇÃO E LISTENERS DE EVENTOS
// =========================================================

// Lógica de identidade Netlify para carregar a lista ao fazer login/logout
netlifyIdentity.on('init', (user) => {
    // Exibe o status inicial do login/logout
    const statusDiv = document.getElementById('netlify-identity-status');
    if (user) {
        statusDiv.innerHTML = `Logado como: <strong>${user.email}</strong>`;
        loadAgentsList();
    } else {
        statusDiv.innerHTML = `<span style="color: red;">Deslogado.</span> <a href="#" data-netlify-identity-button>Faça Login</a>`;
        loadAgentsList(); // Carrega com agente de fallback
    }
});

netlifyIdentity.on('login', loadAgentsList);
netlifyIdentity.on('logout', loadAgentsList);
document.addEventListener('DOMContentLoaded', loadAgentsList);


// Event listeners do chat
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Event listeners de gerenciamento de agentes
document.getElementById('delete-agent-btn').addEventListener('click', deleteSelectedAgent);
document.getElementById('edit-agent-btn').addEventListener('click', () => {
    const agentToEdit = agent.agentsList.find(a => a.AgentID == agent.selectedAgentId);
    if (agentToEdit) {
        agent.fillAgentFormForEdit(agentToEdit);
    }
});

// Listener para o botão de criar
document.getElementById('create-agent-btn').addEventListener('click', () => {
    // Limpa o formulário e configura para criação
    document.getElementById('agent-form').reset();
    document.getElementById('agent-form-title').textContent = 'Criar Novo Agente';
    document.getElementById('save-agent-btn').textContent = 'Salvar Agente';
    
    // Remove listeners antigos e adiciona o de criação
    const form = document.getElementById('agent-form');
    form.removeEventListener('submit', updateExistingAgent);
    form.removeEventListener('submit', saveNewAgent);
    form.addEventListener('submit', saveNewAgent); 

    document.getElementById('form-message').textContent = '';
    document.getElementById('agent-form-container').style.display = 'block';
});