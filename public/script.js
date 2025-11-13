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
            
            // 1. Tenta carregar o histórico do localStorage
            this.loadHistory(); 
            
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
    
    // =================================================================
    // ✅ MÉTODOS DE HISTÓRICO ATUALIZADOS
    // =================================================================

    /**
     * Tenta carregar o histórico do localStorage com base no AgentID atual.
     */
    loadHistory() {
        // ✅ CHAVE ATUALIZADA
        const historyKey = `agent_chat_history_${this.selectedAgentId}`;
        const historyString = localStorage.getItem(historyKey);
        try {
            // Se houver, faz o parse. Senão, retorna array vazio.
            const history = historyString ? JSON.parse(historyString) : [];
            this.chatHistory = history; // Atualiza o histórico em memória
        } catch (e) {
            console.error("Erro ao carregar histórico local:", e);
            this.chatHistory = [];
        }
    }

    /**
     * Salva o histórico atual (em memória) no localStorage.
     */
    saveHistoryToLocal() {
        // ✅ CHAVE ATUALIZADA
        const historyKey = `agent_chat_history_${this.selectedAgentId}`;
        localStorage.setItem(historyKey, JSON.stringify(this.chatHistory));
    }
    
    /**
     * Exibe o histórico na interface, limpando o chat primeiro.
     * @param {boolean} initialMessage - Se deve exibir apenas a mensagem de boas-vindas.
     * @param {string} agentName - O nome do agente para a mensagem de boas-vindas.
     */
    displayChatHistory(initialMessage = false, agentName = "Agente") {
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
        document.getElementById('create-agent-form-container').style.display = 'none';
        document.getElementById('agent-form').reset();
        document.getElementById('agent-id-field').value = ''; // Campo ID é limpo
        document.getElementById('form-title').textContent = 'Criar';
        document.getElementById('save-agent-btn').textContent = 'Salvar Agente';
        document.getElementById('form-message').textContent = '';
    }

    async sendMessage(message) {
        const user = netlifyIdentity.currentUser(); 
        
        if (!user) {
            alert('Você precisa estar logado para usar o assistente.');
            netlifyIdentity.open(); 
            return "Por favor, faça login para continuar.";
        }
        const token = await user.jwt(); 

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ 
                    message, 
                    chatHistory: this.chatHistory,
                    agentId: this.selectedAgentId 
                })
            });

            if (response.status === 401) {
                netlifyIdentity.logout();
                alert('Sessão expirada ou não autorizada. Faça login novamente.');
                return "Sessão expirada. Faça login novamente.";
            }

            const data = await response.json();
            
            if (data.response) {
                this.chatHistory.push(
                    { role: "human", content: message },
                    { role: "assistant", content: data.response }
                );
                
                // ✅ Salva o histórico no localStorage
                this.saveHistoryToLocal(); 
                
                return data.response;
            }
        } catch (error) {
            console.error('Erro:', error);
            return "Desculpe, estou com problemas técnicos no momento.";
        }
    }
}

// Instância do Gerenciador
const agent = new AgentManager();

// =========================================================
// FUNÇÕES GLOBAIS DE CHAT E LÓGICA DE AGENTE
// =========================================================

// Função global para carregar a lista de agentes (usada em login/logout e DOMContentLoaded)
async function loadAgentsList() {
    const selectElement = document.getElementById('agent-select');
    
    selectElement.innerHTML = '<option value="" disabled selected>Carregando Agentes...</option>';
    agent.controlAgentButtons(1); 
    
    try {
        const user = netlifyIdentity.currentUser();
        if (!user) {
             selectElement.innerHTML = '<option value="" disabled selected>Faça login para carregar.</option>';
             agent.agentsList = [];
             agent.updateCreatorInfo(); 
             agent.updateAgentInfo();
             return;
        }

        const token = await user.jwt();
        
        const response = await fetch('/.netlify/functions/getAgents', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
             selectElement.innerHTML = '<option value="" disabled selected>Sessão expirada.</option>';
             agent.agentsList = []; 
             agent.updateCreatorInfo(); 
             agent.updateAgentInfo();
             return;
        }

        const agents = await response.json();
        // Adiciona um agente padrão (fallback) que não existe no DB
        const defaultAgent = { 
            AgentID: 1, 
            AgentName: 'Assistente Padrão (Fallback)', 
            createdBy: 'Sistema',
            agentFunction: 'Assistente de uso geral e fallback.',
            systemPrompt: 'Você é um Assistente especializado. Responda de forma clara, concisa e precisa.',
            shouldSearchPrompt: 'Analise se a pergunta requer informações atualizadas. Responda APENAS com "SIM" ou "NÃO".'
        };
        // O seu arquivo de getAgents retorna apenas os agentes do DB, por isso é crucial manter a lógica do Fallback.
        // Já que o seu código original não incluía o Agente ID 1, vou adicionar ele aqui manualmente:
        const agentsWithFallback = [defaultAgent, ...agents.filter(a => a.AgentID !== 1)];
        agent.agentsList = agentsWithFallback; 
        
        selectElement.innerHTML = ''; 
        
        if (agentsWithFallback && agentsWithFallback.length > 0) {
            agentsWithFallback.forEach(agentItem => {
                const option = document.createElement('option');
                option.value = agentItem.AgentID;
                option.textContent = agentItem.AgentName;
                selectElement.appendChild(option);
            });
            
            let newSelectedId = agent.selectedAgentId;
            const validAgentIds = agentsWithFallback.map(a => a.AgentID.toString());

            if (!validAgentIds.includes(newSelectedId.toString())) {
                newSelectedId = 1; // Volta para o padrão
            }

            agent.selectedAgentId = newSelectedId;
            selectElement.value = newSelectedId;
            
            const selectedName = selectElement.options[selectElement.selectedIndex].textContent;

            agent.controlAgentButtons(parseInt(newSelectedId));
            agent.updateCreatorInfo(); 
            agent.updateAgentInfo(); 
            
            // ✅ Carrega e exibe o histórico para o agente inicial
            agent.loadHistory();
            if (agent.chatHistory.length === 0) {
                 agent.displayChatHistory(true, selectedName); 
            } else {
                 agent.displayChatHistory(); 
                 addMessageToChat('assistant', `Agente **${selectedName}** carregado. Histórico de **${agent.chatHistory.length}** mensagens carregado do cache local.`);
            }
            
        } else {
             selectElement.innerHTML = '<option value="1">Assistente Padrão (DB Vazio)</option>';
             agent.controlAgentButtons(1);
             agent.agentsList = [defaultAgent];
             agent.updateCreatorInfo(); 
             agent.updateAgentInfo(); 
             agent.displayChatHistory(true, 'Assistente Padrão');
             agent.selectedAgentId = 1;
        }

    } catch (error) {
        console.error("Erro ao carregar lista de agentes:", error);
        selectElement.innerHTML = '<option value="1">Erro ao carregar (Usando Padrão)</option>';
        agent.controlAgentButtons(1);
        agent.agentsList = [];
        agent.updateCreatorInfo(); 
        agent.updateAgentInfo(); 
        agent.selectedAgentId = 1;
    }
}

// Listener para mostrar/esconder o formulário
document.getElementById('toggle-form-btn').addEventListener('click', () => {
    const formContainer = document.getElementById('create-agent-form-container');
    const formTitle = document.getElementById('form-title');
    
    if (formContainer.style.display === 'block' && formTitle.textContent.includes('Criar')) {
        agent.hideForm();
    } else {
        agent.hideForm(); 
        formContainer.style.display = 'block';
        document.getElementById('form-message').textContent = 'Preencha os campos para criar um novo agente.';
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
            
            // ✅ CHAVE ATUALIZADA
            localStorage.removeItem(`agent_chat_history_${agentId}`);
            
            loadAgentsList(); 
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

netlifyIdentity.on('logout', () => {
    document.getElementById('agent-select').innerHTML = '<option value="" disabled selected>Faça login para carregar.</option>';
    document.getElementById('delete-agent-btn').disabled = true; 
    document.getElementById('edit-agent-btn').disabled = true;
    document.getElementById('creator-email').textContent = 'N/D';
    document.getElementById('agent-function').textContent = 'N/D';
    agent.hideForm();
    document.getElementById('chat-messages').innerHTML = 
        `<div class="message assistant-message">Olá! Por favor, faça login e selecione um Agente para começar.</div>`;
});


// Event listeners do chat
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Event listeners de gerenciamento de agentes
document.getElementById('delete-agent-btn').addEventListener('click', deleteSelectedAgent);

async function sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value.trim();
    
    if (!netlifyIdentity.currentUser()) {
        alert('Por favor, faça login para enviar mensagens.');
        netlifyIdentity.open();
        return;
    }

    if (message) {
        addMessageToChat('user', message);
        input.value = '';
        input.disabled = true;
        
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message assistant-message';
        loadingDiv.textContent = '💭 Pensando...';
        document.getElementById('chat-messages').appendChild(loadingDiv);
        
        try {
            const response = await agent.sendMessage(message);
            
            loadingDiv.remove();
            addMessageToChat('assistant', response);
        } catch (error) {
            loadingDiv.remove();
            addMessageToChat('assistant', 'Erro ao processar sua mensagem.');
        }
        
        input.disabled = false;
        input.focus();
    }
}