class AgentManager { 
    constructor() {
        this.chatHistory = [];
        this.apiUrl = '/.netlify/functions/agent';
        // ✅ NOVO ENDPOINT DE CARREGAMENTO DO DB
        this.historyApiUrl = '/.netlify/functions/getChatHistory'; 
        this.selectedAgentId = 1; // ID padrão
        this.agentsList = []; // Para armazenar a lista completa (inclui createdBy)
        
        // Listener para a seleção de agente (MODIFICADO para carregar o histórico)
        document.getElementById('agent-select').addEventListener('change', async (e) => {
            this.selectedAgentId = e.target.value; 
            
            // 1. Tenta carregar o histórico do localStorage ou DB
            const user = netlifyIdentity.currentUser();
            if (user) {
                await this.loadHistory(user); 
            } else {
                this.chatHistory = [];
            }
            
            const selectedName = e.target.options[e.target.selectedIndex].textContent;
            
            // 2. Exibe o histórico carregado ou a mensagem inicial
            if (this.chatHistory.length === 0) {
                 this.displayChatHistory(true, selectedName); 
            } else {
                 this.displayChatHistory(); 
                 // Mensagem de confirmação de histórico carregado
                 addMessageToChat('assistant', `Agente **${selectedName}** selecionado. Histórico de **${this.chatHistory.length}** mensagens carregado.`);
            }
            
            this.controlAgentButtons(parseInt(this.selectedAgentId));
            this.updateCreatorInfo(); 
            this.updateAgentInfo();
            this.hideForm(); // Esconde o formulário ao trocar de agente
        });
        
        // Listener do botão de editar
        document.getElementById('edit-agent-btn').addEventListener('click', () => this.showEditForm());
    }
    
    // =================================================================
    // MÉTODOS DE HISTÓRICO ADICIONADOS/MODIFICADOS
    // =================================================================
    
    /**
     * Gera a chave única de localStorage (USER + AGENT).
     */
    generateStorageKey(user) {
        if (!user || !user.email) return null;
        // Limpa o email para usar como chave de forma segura
        const safeEmail = user.email.replace(/[^a-zA-Z0-9]/g, '_');
        return `chat_user_${safeEmail}_agent_${this.selectedAgentId}`;
    }

    /**
     * Tenta carregar o histórico: 1. LocalStorage (Cache). 2. DB (Fallback).
     * @param {object} user - O objeto user do Netlify Identity.
     */
    async loadHistory(user) {
        this.chatHistory = []; // Limpa o histórico em memória antes de tentar carregar
        if (!user) {
            return;
        }

        const historyKey = this.generateStorageKey(user);
        let historyString = localStorage.getItem(historyKey);
        
        // 1. TENTA CARREGAR DO LOCALSTORAGE (CACHE)
        try {
            if (historyString) {
                const history = JSON.parse(historyString);
                // Verifica se o histórico não está vazio (pode ter sido salvo como [])
                if (history && history.length > 0) { 
                    this.chatHistory = history;
                    console.log(`Histórico carregado do localStorage (${history.length} msgs)`);
                    return; // SUCESSO: Retorna o histórico rápido
                }
            }
        } catch (e) {
            console.error("Erro ao carregar histórico local, limpando cache:", e);
            localStorage.removeItem(historyKey);
            // Continua para o DB se o local cache estiver corrompido
        }
        
        // 2. FALHOU NO CACHE. TENTA CARREGAR DO BANCO DE DADOS.
        await this.loadHistoryFromDB(user);
    }
    
    /**
     * Carrega o histórico do DB via Netlify Function.
     * @param {object} user - O objeto user do Netlify Identity.
     */
    async loadHistoryFromDB(user) {
        
        try {
            console.log("LocalStorage vazio ou inválido. Tentando carregar histórico do DB...");
            const token = await user.jwt();

            const response = await fetch(`${this.historyApiUrl}?agentId=${this.selectedAgentId}`, {
                method: 'GET',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                }
            });

            if (!response.ok) {
                 if (response.status === 404) {
                     console.log("Histórico não encontrado no DB. Iniciando novo chat.");
                 } else {
                     console.error(`Erro ao buscar histórico do DB: ${response.statusText}`);
                 }
                 return; // Retorna array vazio (this.chatHistory já é [])
            }
            
            const data = await response.json();
            
            if (data.chatHistory && Array.isArray(data.chatHistory) && data.chatHistory.length > 0) {
                 this.chatHistory = data.chatHistory;
                 
                 // 3. SUCESSO DO DB: SALVA NO LOCALSTORAGE PARA CACHE FUTURO
                 this.saveHistoryToLocal(user); 
                 console.log(`Histórico de ${this.chatHistory.length} mensagens carregado do DB e salvo no cache local.`);
            }

        } catch (error) {
            console.error('Erro de rede ao buscar histórico do DB:', error);
        }
    }

    /**
     * Salva o histórico atual (em memória) no localStorage.
     * @param {object} user - O objeto user do Netlify Identity.
     */
    saveHistoryToLocal(user) {
        const historyKey = this.generateStorageKey(user);
        
        if (!historyKey) {
            return;
        }
        
        localStorage.setItem(historyKey, JSON.stringify(this.chatHistory));
        console.log("Histórico atualizado no localStorage.");
    }
    
    // =================================================================
    // MÉTODOS DE CHAT MODIFICADOS (Incluindo userEmail no payload)
    // =================================================================
    
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
                    agentId: this.selectedAgentId,
                    // ✅ NOVO: Passa o user email para o backend salvar no DB
                    userEmail: user.email 
                })
            });

            if (response.status === 401) {
                // ... (lógica de 401)
                return "Sua sessão expirou. Por favor, faça login novamente.";
            }

            const data = await response.json();
            
            if (data.response) {
                this.chatHistory.push(
                    { role: "human", content: message },
                    { role: "assistant", content: data.response }
                );
                
                // 1. SALVA NO LOCALSTORAGE (CACHE) a cada conversa
                this.saveHistoryToLocal(user); 
                
                // 2. O BACKEND (agent.js) é responsável por salvar/atualizar no DB
                
                return data.response;
            }
            // ... (resto do tratamento de erro)
            return "Erro desconhecido ao receber resposta.";

        } catch (error) {
            console.error('Erro:', error);
            return "Desculpe, estou com problemas técnicos no momento.";
        }
    }
    
    // =================================================================
    // MÉTODOS AUXILIARES
    // =================================================================
    
    controlAgentButtons(selectedId) {
        const deleteButton = document.getElementById('delete-agent-btn');
        const editButton = document.getElementById('edit-agent-btn');
        
        // Garante que IDs <= 1 não possam ser deletados ou editados
        if (selectedId <= 1 || isNaN(selectedId)) {
            deleteButton.disabled = true;
            editButton.disabled = true;
            return;
        }
        
        // Lógica de controle de usuário
        const user = netlifyIdentity.currentUser();
        const selectedAgent = this.agentsList.find(a => a.AgentID == selectedId);
        
        if (selectedAgent && user) {
            const isCreator = selectedAgent.createdBy === user.email;
            deleteButton.disabled = !isCreator;
            editButton.disabled = !isCreator;
        } else {
            deleteButton.disabled = true;
            editButton.disabled = true;
        }
    }

    updateCreatorInfo() {
        const creatorSpan = document.getElementById('creator-email');
        const selectedAgent = this.agentsList.find(a => a.AgentID == this.selectedAgentId);
        
        if (selectedAgent && selectedAgent.createdBy) {
            creatorSpan.textContent = `Criador: ${selectedAgent.createdBy}`;
            creatorSpan.style.display = 'block';
        } else {
            creatorSpan.textContent = 'Criador: N/A';
            creatorSpan.style.display = 'block';
        }
    }
    
    updateAgentInfo() {
        const infoDiv = document.getElementById('agent-info');
        const selectedAgent = this.agentsList.find(a => a.AgentID == this.selectedAgentId);
        
        if (selectedAgent && selectedAgent.agentFunction) {
            infoDiv.innerHTML = `**Função:** ${selectedAgent.agentFunction}`;
            infoDiv.style.display = 'block';
        } else {
            infoDiv.innerHTML = '';
            infoDiv.style.display = 'none';
        }
    }

    displayChatHistory(isNew = false, agentName = 'Assistente') {
        const chatMessagesDiv = document.getElementById('chat-messages');
        chatMessagesDiv.innerHTML = '';

        if (isNew) {
            chatMessagesDiv.innerHTML = 
                `<div class="message assistant-message">Agente **${agentName}** selecionado. Novo chat iniciado.</div>`;
        } else {
            this.chatHistory.forEach(msg => {
                if (msg.role === 'human') {
                    addMessageToChat('user', msg.content);
                } else if (msg.role === 'assistant') {
                    addMessageToChat('assistant', msg.content);
                }
            });
        }
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    }
    
    showEditForm() {
        const formDiv = document.getElementById('agent-form-container');
        const formTitle = document.getElementById('agent-form-title');
        const form = document.getElementById('agent-form');
        const saveButton = document.getElementById('save-agent-btn');
        const formMessage = document.getElementById('form-message');
        
        const selectedAgent = this.agentsList.find(a => a.AgentID == this.selectedAgentId);
        
        if (!selectedAgent) {
            alert("Agente não encontrado.");
            return;
        }

        formTitle.textContent = `Editar Agente: ${selectedAgent.AgentName}`;
        document.getElementById('agent-id-input').value = selectedAgent.AgentID;
        document.getElementById('agent-name-input').value = selectedAgent.AgentName;
        document.getElementById('agent-function-input').value = selectedAgent.agentFunction;
        document.getElementById('system-prompt').value = selectedAgent.systemPrompt;
        document.getElementById('search-prompt').value = selectedAgent.shouldSearchPrompt;
        saveButton.textContent = 'Atualizar Agente';
        form.removeEventListener('submit', saveNewAgent); // Remove o listener de criação
        form.addEventListener('submit', updateExistingAgent); // Adiciona o listener de edição
        formMessage.textContent = '';
        formDiv.style.display = 'block';
    }
    
    hideForm() {
        document.getElementById('agent-form-container').style.display = 'none';
        // Limpa o formulário e restaura o listener de criação por padrão, caso o usuário abra ele novamente
        document.getElementById('agent-form').reset();
        document.getElementById('agent-form').removeEventListener('submit', updateExistingAgent);
        document.getElementById('agent-form').addEventListener('submit', saveNewAgent); 
        document.getElementById('save-agent-btn').textContent = 'Salvar Agente';
    }
}


// Inicializar agent 
const agent = new AgentManager(); 

// Função de utilidade para adicionar mensagens ao DOM (mantida)
function addMessageToChat(role, content) {
    const chatMessagesDiv = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    // Converte markdown para HTML (exemplo simples: **texto** para <strong>texto</strong>)
    let formattedContent = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    messageDiv.innerHTML = formattedContent;
    chatMessagesDiv.appendChild(messageDiv);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}


// FUNÇÃO: Carrega agentes do Netlify Function (getAgents)
async function loadAgentsList() {
    const user = netlifyIdentity.currentUser();
    const selectElement = document.getElementById('agent-select');
    selectElement.innerHTML = '';
    
    if (!user) {
        selectElement.innerHTML = '<option value="1" selected>Faça Login para carregar...</option>';
        document.getElementById('chat-messages').innerHTML = 
            `<div class="message assistant-message">Olá! Por favor, faça login e selecione um Agente para começar.</div>`;
        agent.agentsList = [];
        agent.controlAgentButtons(1); // Desabilita botões
        agent.updateCreatorInfo();
        agent.updateAgentInfo();
        return;
    }

    try {
        const token = await user.jwt();

        const response = await fetch('/.netlify/functions/getAgents', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Erro ao buscar agentes: ${response.statusText}`);
        }

        const agents = await response.json();
        
        // Fallback Agent (sempre o primeiro)
        const fallbackAgent = {
            AgentID: 1, 
            AgentName: "Assistente Padrão (Fallback)",
            agentFunction: "Assistente geral. Use para testes.",
            createdBy: "sistema",
            systemPrompt: "", // Vazio porque o backend usa o fallback
            shouldSearchPrompt: ""
        };
        
        agent.agentsList = [fallbackAgent, ...agents.filter(a => a.AgentID > 1)];

        if (agent.agentsList.length > 0) {
            agent.agentsList.forEach(a => {
                const option = document.createElement('option');
                option.value = a.AgentID;
                option.textContent = a.AgentName;
                selectElement.appendChild(option);
            });

            // Seleciona o primeiro agente ou o agente ativo
            selectElement.value = agent.selectedAgentId;
            
            // ✅ NOVO: Chama a nova função loadHistory assíncrona
            if (user) {
                await agent.loadHistory(user); 
            }
            
            const selectedName = selectElement.options[selectElement.selectedIndex].textContent;

            if (agent.chatHistory.length === 0) {
                 agent.displayChatHistory(true, selectedName); 
            } else {
                 agent.displayChatHistory(); 
                 // Mensagem atualizada
                 addMessageToChat('assistant', `Agente **${selectedName}** carregado. Histórico de **${agent.chatHistory.length}** mensagens carregado.`);
            }
            
            agent.controlAgentButtons(parseInt(agent.selectedAgentId));
            agent.updateCreatorInfo();
            agent.updateAgentInfo();
            
        } else {
            selectElement.innerHTML = '<option value="1" selected>Nenhum Agente encontrado</option>';
            document.getElementById('chat-messages').innerHTML = 
                `<div class="message assistant-message">Nenhum agente disponível. Crie um novo.</div>`;
            agent.controlAgentButtons(1);
            agent.updateCreatorInfo();
            agent.updateAgentInfo();
        }
        
    } catch (error) {
        console.error('Erro ao carregar lista de agentes:', error);
        selectElement.innerHTML = '<option value="1" selected>Erro ao carregar Agentes</option>';
    }
}

// FUNÇÕES DE CRIAÇÃO/EDIÇÃO (MANTIDAS)
async function saveNewAgent(e) {
    e.preventDefault();
    const user = netlifyIdentity.currentUser();
    if (!user) { alert('Faça login.'); return; }

    const form = e.target;
    const formMessage = document.getElementById('form-message');
    formMessage.textContent = 'Salvando...';

    const newAgent = {
        AgentName: document.getElementById('agent-name-input').value,
        agentFunction: document.getElementById('agent-function-input').value,
        systemPrompt: document.getElementById('system-prompt').value,
        shouldSearchPrompt: document.getElementById('search-prompt').value,
        createdBy: user.email // Garante que o criador é o usuário logado
    };

    try {
        const token = await user.jwt();
        const response = await fetch('/.netlify/functions/createAgent', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(newAgent)
        });

        if (response.ok) {
            const data = await response.json();
            formMessage.textContent = `✅ Agente '${data.AgentName}' criado com sucesso!`;
            form.reset();
            agent.hideForm();
            await loadAgentsList(); // Recarrega a lista para mostrar o novo agente
            // Define o novo agente como selecionado
            agent.selectedAgentId = data.AgentID; 
            document.getElementById('agent-select').value = data.AgentID;
            agent.controlAgentButtons(data.AgentID);
        } else {
            const errorData = await response.json();
            formMessage.textContent = `❌ Erro ao criar: ${errorData.error || response.statusText}`;
        }
    } catch (error) {
        console.error('Erro de rede:', error);
        formMessage.textContent = '❌ Erro de rede ao criar agente.';
    }
}

async function updateExistingAgent(e) {
    e.preventDefault();
    const user = netlifyIdentity.currentUser();
    if (!user) { alert('Faça login.'); return; }

    const formMessage = document.getElementById('form-message');
    formMessage.textContent = 'Atualizando...';
    
    const agentId = parseInt(document.getElementById('agent-id-input').value);
    
    // Verifica se o usuário logado é o criador antes de enviar
    const selectedAgent = agent.agentsList.find(a => a.AgentID == agentId);
    if (!selectedAgent || selectedAgent.createdBy !== user.email) {
        formMessage.textContent = "❌ Você não tem permissão para editar este agente.";
        return;
    }

    const updatedAgent = {
        AgentID: agentId,
        AgentName: document.getElementById('agent-name-input').value,
        agentFunction: document.getElementById('agent-function-input').value,
        systemPrompt: document.getElementById('system-prompt').value,
        shouldSearchPrompt: document.getElementById('search-prompt').value,
    };

    try {
        const token = await user.jwt();
        const response = await fetch('/.netlify/functions/updateAgent', {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(updatedAgent)
        });

        if (response.ok) {
            const data = await response.json();
            formMessage.textContent = `✅ Agente '${data.AgentName}' atualizado com sucesso!`;
            agent.hideForm();
            await loadAgentsList(); // Recarrega a lista
        } else if (response.status === 403) {
             formMessage.textContent = "❌ Acesso negado. Você não é o criador deste agente.";
        } else {
            const errorData = await response.json();
            formMessage.textContent = `❌ Erro ao atualizar: ${errorData.error || response.statusText}`;
        }
    } catch (error) {
        console.error('Erro de rede:', error);
        formMessage.textContent = '❌ Erro de rede ao atualizar agente.';
    }
}


// FUNÇÃO: Envio de Mensagem (MANTIDA)
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

// FUNÇÃO: Deletar Agente (MODIFICADA para limpar o cache)
async function deleteSelectedAgent() {
    const user = netlifyIdentity.currentUser();
    const agentId = agent.selectedAgentId;
    
    if (!user || agentId <= 1) {
        alert('Operação não permitida.');
        return;
    }

    const selectedOption = document.getElementById('agent-select').querySelector(`option[value="${agentId}"]`);
    const agentName = selectedOption ? selectedOption.textContent : `ID ${agentId}`;

    if (!confirm(`Tem certeza que deseja DELETAR o Agente '${agentName}'? Esta ação é irreversível e deletará também TODO O HISTÓRICO DE CHAT dele com TODOS os usuários.`)) {
        return;
    }
    
    // Verifica se o usuário logado é o criador antes de enviar
    const selectedAgent = agent.agentsList.find(a => a.AgentID == agentId);
    if (!selectedAgent || selectedAgent.createdBy !== user.email) {
        alert("Você não tem permissão para deletar este agente.");
        return;
    }

    try {
        const token = await user.jwt();
        const response = await fetch(`/.netlify/functions/deleteAgent?agentId=${agentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            alert(`✅ Agente '${agentName}' deletado com sucesso!`);
            
            // ✅ NOVO: Remove o histórico do localStorage do usuário atual
            const historyKey = agent.generateStorageKey(user);
            if(historyKey) {
                localStorage.removeItem(historyKey);
            }
            
            // Recarrega a lista
            await loadAgentsList(); 
        } else if (response.status === 404) {
             alert(`Agente ID ${agentId} não encontrado.`);
        } else {
            const errorData = await response.json();
            alert(`❌ Erro ao deletar: ${errorData.error || 'Erro de servidor.'}`);
        }
    } catch (error) {
        console.error('Erro de rede ao deletar agente:', error);
        alert('Erro de rede ao tentar deletar o agente.');
    }
}

// Lógica de identidade Netlify para carregar a lista ao fazer login/logout (mantida)
netlifyIdentity.on('login', loadAgentsList);
netlifyIdentity.on('logout', loadAgentsList);
document.addEventListener('DOMContentLoaded', loadAgentsList);
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
document.getElementById('delete-agent-btn').addEventListener('click', deleteSelectedAgent);
document.getElementById('create-agent-btn').addEventListener('click', () => {
    // Limpa o formulário e configura para criação
    document.getElementById('agent-form').reset();
    document.getElementById('agent-form-title').textContent = 'Criar Novo Agente';
    document.getElementById('save-agent-btn').textContent = 'Salvar Agente';
    document.getElementById('agent-form').removeEventListener('submit', updateExistingAgent);
    document.getElementById('agent-form').addEventListener('submit', saveNewAgent); 
    document.getElementById('form-message').textContent = '';
    document.getElementById('agent-form-container').style.display = 'block';
});