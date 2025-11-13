class AgentManager { 
    constructor() {
        this.chatHistory = [];
        this.apiUrl = '/.netlify/functions/agent';
        this.saveChatHistoryUrl = '/.netlify/functions/saveChatHistory'; // NOVA URL
        this.loadChatHistoryUrl = '/.netlify/functions/loadChatHistory'; // NOVA URL
        this.selectedAgentId = 1; 
        this.agentsList = []; 
        
        // Listener para a seleção de agente (MODIFICADO para carregar o histórico)
        document.getElementById('agent-select').addEventListener('change', async (e) => { // Tornar assíncrono
            this.selectedAgentId = e.target.value; 
            
            const selectedName = e.target.options[e.target.selectedIndex].textContent;

            // NOVO: Prioriza carregar do Banco de Dados
            const user = netlifyIdentity.currentUser();
            await this.loadChatHistory(user, selectedName); 
            
            this.controlAgentButtons(parseInt(this.selectedAgentId));
            this.updateCreatorInfo(); 
            this.updateAgentInfo();
            this.hideForm();
        });
    }
    
    // =================================================================
    // ✅ MÉTODOS DE HISTÓRICO ATUALIZADOS PARA USAR BANCO DE DADOS
    // =================================================================
    
    /**
     * Gera a chave de localStorage APENAS com o AgentID (para cache).
     * @returns {string} A chave de cache local.
     */
    generateLocalCacheKey() {
        return `chat_cache_agent_${this.selectedAgentId}`;
    }

    /**
     * Tenta carregar o histórico: 1. DB, 2. Local Cache.
     * @param {object} user - O objeto user do Netlify Identity.
     * @param {string} agentName - Nome do agente para mensagens.
     */
    async loadChatHistory(user, agentName = "Agente") {
        if (!user) {
            this.chatHistory = [];
            this.displayChatHistory(true, agentName);
            return;
        }

        const token = await user.jwt();
        let loadedFrom = 'Novo chat iniciado.';
        
        // --- 1. Tentar carregar do BANCO DE DADOS ---
        try {
            const response = await fetch(`${this.loadChatHistoryUrl}?agentId=${this.selectedAgentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.history && data.history.length > 0) {
                    this.chatHistory = data.history;
                    this.saveChatHistoryToLocal(user); // Salva no cache local para otimização
                    loadedFrom = `Histórico de **${this.chatHistory.length}** mensagens carregado do **Banco de Dados**.`;
                    console.log(`Histórico carregado do DB para o Agente ${this.selectedAgentId}.`);
                } else {
                    // Histórico vazio no DB, tenta o cache local
                    this.loadChatHistoryFromLocalCache();
                    loadedFrom = this.chatHistory.length > 0 ? 
                                `Histórico de **${this.chatHistory.length}** mensagens carregado do **Cache Local** (DB vazio).` :
                                'Novo chat iniciado.';
                }
            } else {
                console.error("Falha ao carregar histórico do DB. Tentando cache local.");
                 // Tenta o cache local em caso de erro no DB
                this.loadChatHistoryFromLocalCache();
                loadedFrom = this.chatHistory.length > 0 ? 
                            `Histórico de **${this.chatHistory.length}** mensagens carregado do **Cache Local** (Erro DB).` :
                            'Novo chat iniciado.';
            }
        } catch (e) {
            console.error("Erro fatal ao carregar histórico do DB:", e);
             // Tenta o cache local em caso de erro na rede
            this.loadChatHistoryFromLocalCache();
            loadedFrom = this.chatHistory.length > 0 ? 
                        `Histórico de **${this.chatHistory.length}** mensagens carregado do **Cache Local** (Erro Fatal).` :
                        'Novo chat iniciado.';
        }
        
        // --- 2. Exibe o Histórico ---
        this.displayChatHistory(this.chatHistory.length === 0, agentName); 
        
        if (this.chatHistory.length > 0) {
             addMessageToChat('assistant', `Agente **${agentName}** selecionado. ${loadedFrom}`);
        }
    }

    /**
     * Carrega o histórico de chat do cache local (sem UserID).
     */
    loadChatHistoryFromLocalCache() {
        const historyKey = this.generateLocalCacheKey();
        const historyString = localStorage.getItem(historyKey);
        try {
            this.chatHistory = historyString ? JSON.parse(historyString) : []; 
        } catch (e) {
            console.error("Erro ao carregar histórico local:", e);
            this.chatHistory = [];
        }
    }

    /**
     * Salva o histórico atual (em memória) no localStorage (cache local).
     */
    saveChatHistoryToLocal() {
        const historyKey = this.generateLocalCacheKey();
        localStorage.setItem(historyKey, JSON.stringify(this.chatHistory));
    }
    
    /**
     * Salva o histórico (em memória) no Banco de Dados.
     * @param {object} user - O objeto user do Netlify Identity.
     */
    async saveChatHistoryToDatabase(user) {
        if (!user) {
            console.error("Não foi possível salvar no DB: Usuário não logado.");
            return;
        }
        
        try {
            const token = await user.jwt();
            
            const historyData = {
                agentId: parseInt(this.selectedAgentId),
                userId: user.sub, // 'sub' é um bom ID de usuário único
                history: this.chatHistory
            };
            
            const response = await fetch(this.saveChatHistoryUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(historyData)
            });

            if (!response.ok) {
                 console.error("Falha ao salvar histórico no DB:", await response.json());
            } else {
                 console.log("Histórico salvo com sucesso no DB.");
            }
            
        } catch (e) {
            console.error("Erro de rede/conexão ao salvar no DB:", e);
        }
    }
    
    /**
     * Exibe o histórico na interface, limpando o chat primeiro.
     * @param {boolean} initialMessage - Se deve exibir apenas a mensagem de boas-vindas.
     * @param {string} agentName - O nome do agente para a mensagem de boas-vindas.
     */
    displayChatHistory(initialMessage = false, agentName = "Agente") {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = ''; // Limpa antes de exibir

        if (initialMessage) {
            const htmlContent = `Agente **${agentName}** selecionado. Novo chat iniciado.`;
            chatMessages.innerHTML = 
                `<div class="message assistant-message">${htmlContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }

        this.chatHistory.forEach(msg => {
            const sender = msg.role === 'human' ? 'user' : 'assistant'; 
            addMessageToChat(sender, msg.content);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // =================================================================
    // FIM DOS MÉTODOS DE HISTÓRICO
    // =================================================================
    
    // ... (controlAgentButtons, updateCreatorInfo, updateAgentInfo, fillAgentFormForEdit, hideForm permanecem iguais)
    
    controlAgentButtons(selectedId) {
        const deleteButton = document.getElementById('delete-agent-btn');
        const editButton = document.getElementById('edit-agent-btn');
        
        // Garante que IDs <= 1 não possam ser deletados ou editados
        const isDisabled = (selectedId <= 1 || isNaN(selectedId));
        
        deleteButton.disabled = isDisabled;
        editButton.disabled = isDisabled;
    }

    // NOVO MÉTODO: Atualiza o texto do criador
    updateCreatorInfo() {
        const creatorSpan = document.getElementById('creator-email');
        const selectedAgent = this.agentsList.find(a => a.AgentID == this.selectedAgentId);
        
        if (selectedAgent && selectedAgent.createdBy) {
            creatorSpan.textContent = selectedAgent.createdBy;
        } else {
            creatorSpan.textContent = 'N/D';
        }
    }
    
    // NOVO MÉTODO: Atualiza o texto da função do agente
    updateAgentInfo() {
        const agentFunctionSpan = document.getElementById('agent-function');
        const selectedAgent = this.agentsList.find(a => a.AgentID == this.selectedAgentId);
        
        if (selectedAgent && selectedAgent.agentFunction) {
            agentFunctionSpan.textContent = selectedAgent.agentFunction;
        } else {
            agentFunctionSpan.textContent = 'N/D';
        }
    }
    
    // ✅ NOVO MÉTODO: Preenche o formulário para edição
    fillAgentFormForEdit() {
        const selectedAgent = this.agentsList.find(a => a.AgentID == this.selectedAgentId);
        const formTitle = document.getElementById('form-title');
        const formContainer = document.getElementById('create-agent-form-container');
        
        if (selectedAgent && selectedAgent.AgentID > 1) {
            // Preenche os campos do formulário
            document.getElementById('agent-id-field').value = selectedAgent.AgentID;
            document.getElementById('agent-name').value = selectedAgent.AgentName;
            document.getElementById('agent-function-input').value = selectedAgent.agentFunction || ''; 
            document.getElementById('system-prompt').value = selectedAgent.systemPrompt || '';
            document.getElementById('search-prompt').value = selectedAgent.shouldSearchPrompt || '';
            
            // Configura o título e exibe
            formTitle.textContent = `Editar Agente: ${selectedAgent.AgentName}`;
            document.getElementById('save-agent-btn').textContent = 'Salvar Alterações';
            formContainer.style.display = 'block';
            document.getElementById('form-message').textContent = 'Modifique os campos e clique em Salvar Alterações.';
            document.getElementById('form-message').style.color = 'blue';
        } else {
            alert("Nenhum agente válido (ID > 1) selecionado para edição.");
            this.hideForm();
        }
    }

    // ✅ NOVO MÉTODO: Função auxiliar para esconder e limpar o formulário
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
                
                // ✅ NOVO: Salva o histórico no localStorage (cache local)
                this.saveChatHistoryToLocal(); 
                // ✅ NOVO: Salva o histórico no Banco de Dados
                this.saveChatHistoryToDatabase(user);
                
                return data.response;
            }
        } catch (error) {
            console.error('Erro:', error);
            return "Desculpe, estou com problemas técnicos no momento.";
        }
    }
}

// Inicializar agent 
const agent = new AgentManager(); 

// Função para adicionar mensagens ao chat (Melhorada para formatar Markdown básico)
function addMessageToChat(sender, message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    
    messageDiv.className = `message ${sender}-message`;
    
    // Converte Markdown básico para HTML para melhor visualização
    const htmlContent = message
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
        .replace(/\r\n|\n/g, '<br>'); // Quebras de linha

    messageDiv.innerHTML = htmlContent; 
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// FUNÇÃO: Carrega agentes do Netlify Function (getAgents)
async function loadAgentsList() {
    const selectElement = document.getElementById('agent-select');
    
    selectElement.innerHTML = '<option value="" disabled selected>Carregando Agentes...</option>';
    agent.controlAgentButtons(1); 
    
    const user = netlifyIdentity.currentUser();
    
    try {
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
            
            // ✅ NOVO: Carrega o histórico para o agente inicial (Prioriza DB)
            await agent.loadChatHistory(user, selectedName);
            
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

// ... (Restante do código, incluindo listeners de formulário e chat, permanece igual)

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
});

// Listener para EDITAR Agente
document.getElementById('edit-agent-btn').addEventListener('click', () => {
    if (parseInt(agent.selectedAgentId) > 1) {
        agent.fillAgentFormForEdit();
    } else {
        alert("Selecione um agente válido para edição.");
    }
});

// Listener para submissão do formulário (Criação ou Edição)
document.getElementById('agent-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const agentId = document.getElementById('agent-id-field').value;
    
    if (agentId) {
        await updateAgent();
    } else {
        await createNewAgent(); 
    }
});

// Função para enviar os dados para a Netlify Function (createAgent)
async function createNewAgent() {
    const user = netlifyIdentity.currentUser();
    const formMessage = document.getElementById('form-message');

    if (!user) {
        formMessage.textContent = 'Erro: Você precisa estar logado para criar novos agentes.';
        formMessage.style.color = 'red';
        return;
    }
    
    const agentData = {
        AgentName: document.getElementById('agent-name').value,
        agentFunction: document.getElementById('agent-function-input').value,
        systemPrompt: document.getElementById('system-prompt').value,
        shouldSearchPrompt: document.getElementById('search-prompt').value,
        createdBy: user.email, 
    };

    const saveButton = document.getElementById('save-agent-btn');
    saveButton.disabled = true;
    formMessage.textContent = 'Salvando novo agente...';
    formMessage.style.color = 'blue';

    try {
        const token = await user.jwt();
        
        const response = await fetch('/.netlify/functions/createAgent', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(agentData)
        });

        const data = await response.json();

        if (response.ok) {
            formMessage.textContent = `✅ Agente '${data.AgentName}' criado com sucesso! (ID: ${data.AgentID})`;
            formMessage.style.color = 'green';
            agent.hideForm();
            
            await loadAgentsList(); 
            document.getElementById('agent-select').value = data.AgentID;

        } else {
            formMessage.textContent = `❌ Falha ao criar agente: ${data.error || 'Erro desconhecido'}`;
            formMessage.style.color = 'red';
        }

    } catch (error) {
        console.error('Erro na criação do agente:', error);
        formMessage.textContent = `❌ Erro de conexão. Verifique o console.`;
        formMessage.style.color = 'red';
    } finally {
        saveButton.disabled = false;
    }
}

// Função: Lógica de atualização (edição)
async function updateAgent() {
    const user = netlifyIdentity.currentUser();
    const formMessage = document.getElementById('form-message');

    if (!user) {
        formMessage.textContent = 'Erro: Você precisa estar logado para editar agentes.';
        formMessage.style.color = 'red';
        return;
    }
    
    const agentId = document.getElementById('agent-id-field').value;

    if (parseInt(agentId) <= 1 || isNaN(parseInt(agentId))) {
        formMessage.textContent = 'Erro: Agente Padrão (ID 1) não pode ser editado.';
        formMessage.style.color = 'red';
        return;
    }

    const agentData = {
        AgentID: parseInt(agentId),
        AgentName: document.getElementById('agent-name').value,
        agentFunction: document.getElementById('agent-function-input').value,
        systemPrompt: document.getElementById('system-prompt').value,
        shouldSearchPrompt: document.getElementById('search-prompt').value,
    };

    const saveButton = document.getElementById('save-agent-btn');
    saveButton.disabled = true;
    formMessage.textContent = `Atualizando agente ID ${agentId}...`;
    formMessage.style.color = 'blue';

    try {
        const token = await user.jwt();
        
        const response = await fetch('/.netlify/functions/updateAgent', {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(agentData)
        });

        const data = await response.json();

        if (response.ok) {
            formMessage.textContent = `✅ Agente '${agentData.AgentName}' (ID: ${agentId}) atualizado com sucesso!`;
            formMessage.style.color = 'green';
            agent.hideForm();
            
            await loadAgentsList(); 

        } else {
            formMessage.textContent = `❌ Falha ao atualizar agente: ${data.error || 'Erro desconhecido'}`;
            formMessage.style.color = 'red';
        }

    } catch (error) {
        console.error('Erro na atualização do agente:', error);
        formMessage.textContent = `❌ Erro de conexão. Verifique o console.`;
        formMessage.style.color = 'red';
    } finally {
        saveButton.disabled = false;
    }
}

// Função para enviar o AgentID selecionado para exclusão
async function deleteSelectedAgent() {
    const user = netlifyIdentity.currentUser();
    const selectElement = document.getElementById('agent-select');
    const agentId = selectElement.value;
    const agentName = selectElement.options[selectElement.selectedIndex].textContent;

    if (parseInt(agentId) <= 1) { 
        alert("Agente Padrão ou ID inválido não pode ser excluído.");
        return;
    }
    
    if (!confirm(`Tem certeza que deseja DELETAR o agente "${agentName}" (ID: ${agentId})? Esta ação é irreversível.`)) {
        return;
    }

    if (!user) {
        alert('Você precisa estar logado para deletar agentes.');
        return;
    }
    
    const deleteButton = document.getElementById('delete-agent-btn');
    deleteButton.disabled = true;

    try {
        const token = await user.jwt();
        
        const response = await fetch(`/.netlify/functions/deleteAgent?agentId=${agentId}`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}` 
            }
        });

        if (response.ok) {
            alert(`✅ Agente '${agentName}' deletado com sucesso!`);
            
            // ✅ NOVO: Remove o histórico do localStorage do usuário atual
            const historyKey = agent.generateLocalCacheKey();
            if(historyKey) {
                localStorage.removeItem(historyKey);
            }
            // NOVO: Chamada para deletar do DB (se existir a função)
            await deleteHistoryFromDatabase(user, agentId);
            
            loadAgentsList(); 
        } else {
            const data = await response.json();
            alert(`❌ Falha ao deletar: ${data.error || 'Erro desconhecido'}`);
        }

    } catch (error) {
        console.error('Erro ao deletar agente:', error);
        alert(`❌ Erro de conexão. Verifique o console.`);
    } finally {
        deleteButton.disabled = false;
    }
}

// NOVO: Função para deletar o histórico de um agente do DB (opcional, requer outra função Netlify)
async function deleteHistoryFromDatabase(user, agentId) {
    // Você precisaria de outra função Netlify para isso, se quisesse apagar o histórico no delete do agente.
    // Exemplo: fetch(`/.netlify/functions/deleteHistory?agentId=${agentId}&userId=${user.sub}`, { method: 'DELETE', ... });
    console.log(`Função para deletar histórico do agente ${agentId} do DB precisa ser implementada.`);
}


// --- Event Listeners de Inicialização e Gestão ---

netlifyIdentity.on('init', (user) => {
    if (user) {
        loadAgentsList();
    } else {
        document.getElementById('chat-messages').innerHTML = 
        `<div class="message assistant-message">Olá! Por favor, faça login e selecione um Agente para começar.</div>`;
    }
});

// Ao fazer login ou trocar de agente, o histórico é carregado com o user.email
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
    // Nota: O histórico de chat de TODOS os agentes do usuário anterior permanece no localStorage,
    // mas não será acessível por outro usuário por causa do email na chave.
});


// Event listeners do chat e do botão de deletar
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
document.getElementById('delete-agent-btn').addEventListener('click', deleteSelectedAgent);

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