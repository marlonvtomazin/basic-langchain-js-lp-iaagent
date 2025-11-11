class AgentManager { 
    constructor() {
        this.chatHistory = [];
        this.apiUrl = '/.netlify/functions/agent';
        this.selectedAgentId = 1; // ID padrão
        this.agentsList = []; // Para armazenar a lista completa (inclui createdBy)
        
        // Listener para a seleção de agente (MODIFICADO para carregar o histórico)
        document.getElementById('agent-select').addEventListener('change', (e) => {
            this.selectedAgentId = e.target.value; 
            
            // 1. Tenta carregar o histórico do localStorage
            this.loadHistory(); 
            
            const selectedName = e.target.options[e.target.selectedIndex].textContent;
            
            // 2. Exibe o histórico carregado ou a mensagem inicial
            if (this.chatHistory.length === 0) {
                 this.displayChatHistory(true, selectedName); 
            } else {
                 this.displayChatHistory(); 
                 // Mensagem de confirmação de histórico carregado
                 addMessageToChat('assistant', `Agente **${selectedName}** selecionado. Histórico de **${this.chatHistory.length}** mensagens carregado do cache local.`);
            }
            
            this.controlAgentButtons(parseInt(this.selectedAgentId));
            this.updateCreatorInfo(); 
            this.updateAgentInfo();
            this.hideForm(); // Esconde o formulário ao trocar de agente
        });
    }
    
    // =================================================================
    // ✅ NOVOS MÉTODOS DE HISTÓRICO (localStorage)
    // =================================================================

    /**
     * Tenta carregar o histórico do localStorage com base no AgentID atual.
     */
    loadHistory() {
        const historyKey = `chat_history_${this.selectedAgentId}`;
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
        const historyKey = `chat_history_${this.selectedAgentId}`;
        localStorage.setItem(historyKey, JSON.stringify(this.chatHistory));
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
            // Adiciona quebra de linha para formatar o nome do agente em negrito
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


    // ✅ NOVO MÉTODO: Controla os botões Deletar e Editar
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
                
                // ✅ NOVO: Salva o histórico no localStorage
                this.saveHistoryToLocal(); 
                
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
            
            // ✅ NOVO: Carrega e exibe o histórico para o agente inicial
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
            
            // ✅ NOVO: Remove o histórico do localStorage
            localStorage.removeItem(`chat_history_${agentId}`);
            
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


// --- Event Listeners de Inicialização e Gestão ---

netlifyIdentity.on('init', (user) => {
    if (user) {
        loadAgentsList();
    } else {
        document.getElementById('chat-messages').innerHTML = 
        `<div class="message assistant-message">Olá! Por favor, faça login e selecione um Agente para começar.</div>`;
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