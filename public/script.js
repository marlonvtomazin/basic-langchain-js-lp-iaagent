class FarmaceuticoAgent {
    constructor() {
        this.chatHistory = [];
        this.apiUrl = '/.netlify/functions/agent';
        this.selectedAgentId = 1; // ID padrão
        
        // Listener para a seleção de agente (MODIFICADO para controlar o botão Deletar)
        document.getElementById('agent-select').addEventListener('change', (e) => {
            this.selectedAgentId = e.target.value;
            this.chatHistory = []; // Limpa o histórico ao mudar o agente
            
            const selectedName = e.target.options[e.target.selectedIndex].textContent;
            
            document.getElementById('chat-messages').innerHTML = 
                `<div class="message assistant-message">Agente **${selectedName}** selecionado. Novo chat iniciado.</div>`;
            
            // Lógica para desabilitar o botão de deletar se for o Agente 1
            const deleteButton = document.getElementById('delete-agent-btn');
            // Desabilita se o ID for 1 ou se não houver um ID válido
            deleteButton.disabled = (parseInt(this.selectedAgentId) <= 1 || isNaN(parseInt(this.selectedAgentId)));
        });
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
                return data.response;
            }
        } catch (error) {
            console.error('Erro:', error);
            return "Desculpe, estou com problemas técnicos no momento.";
        }
    }
}

// Função para adicionar mensagens ao chat
function addMessageToChat(sender, message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    
    messageDiv.className = `message ${sender}-message`;
    messageDiv.innerHTML = message; 
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// FUNÇÃO CORRIGIDA: Carrega agentes do Netlify Function (getAgents)
async function loadAgentsList() {
    const selectElement = document.getElementById('agent-select');
    const deleteButton = document.getElementById('delete-agent-btn');
    
    selectElement.innerHTML = '<option value="" disabled selected>Carregando Agentes...</option>';
    deleteButton.disabled = true; 
    
    try {
        const user = netlifyIdentity.currentUser();
        if (!user) {
             selectElement.innerHTML = '<option value="" disabled selected>Faça login para carregar.</option>';
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
             return;
        }

        const agents = await response.json();
        
        selectElement.innerHTML = ''; 
        
        if (agents && agents.length > 0) {
            agents.forEach(agentItem => {
                const option = document.createElement('option');
                option.value = agentItem.AgentID;
                option.textContent = agentItem.AgentName;
                selectElement.appendChild(option);
            });
            
            // --- LÓGICA DE SELEÇÃO CORRIGIDA ---
            let newSelectedId = agent.selectedAgentId;
            const validAgentIds = agents.map(a => a.AgentID.toString());

            // 1. Verifica se o ID selecionado ainda existe.
            if (!validAgentIds.includes(newSelectedId.toString())) {
                console.warn(`Agente ${newSelectedId} não existe mais. Voltando para o ID 1.`);
                newSelectedId = 1; // Volta para o ID 1 como fallback
            }

            // 2. Garante que o ID 1 exista ou que haja outro ID válido (caso o ID 1 tenha sido removido, o que não deve acontecer)
            if (!validAgentIds.includes('1') && agents.length > 0) {
                 newSelectedId = agents[0].AgentID; // Pega o primeiro agente disponível
            } else if (agents.length === 0) {
                 newSelectedId = 1; // Fallback extremo se o DB estiver vazio
            }

            // 3. Aplica a seleção
            agent.selectedAgentId = newSelectedId;
            selectElement.value = newSelectedId;
            
            const selectedName = selectElement.options[selectElement.selectedIndex].textContent;

            // 4. Controla o botão Deletar
            deleteButton.disabled = (parseInt(newSelectedId) <= 1);

            addMessageToChat('assistant', `Agente **${selectedName}** carregado. Comece a conversar!`);
            
        } else {
             // Caso a lista esteja vazia
             selectElement.innerHTML = '<option value="1">Assistente Padrão (DB Vazio)</option>';
             deleteButton.disabled = true;
             addMessageToChat('assistant', 'Nenhum agente encontrado no DB. Usando o padrão.');
             agent.selectedAgentId = 1;
        }

    } catch (error) {
        console.error("Erro ao carregar lista de agentes:", error);
        selectElement.innerHTML = '<option value="1">Erro ao carregar (Usando Padrão)</option>';
        deleteButton.disabled = true;
        agent.selectedAgentId = 1;
    }
}


// --- Lógica de Criação de Agente ---

// Listener para mostrar/esconder o formulário
document.getElementById('toggle-form-btn').addEventListener('click', () => {
    const formContainer = document.getElementById('create-agent-form-container');
    formContainer.style.display = formContainer.style.display === 'none' ? 'block' : 'none';
});

// Listener para submissão do formulário
document.getElementById('new-agent-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await createNewAgent();
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
        agentFunction: document.getElementById('agent-function').value,
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
            document.getElementById('new-agent-form').reset(); 
            
            // Recarrega a lista e seleciona o novo agente
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

// --- Lógica de Exclusão de Agente ---

// Listener para o botão de deletar (adicionado no final)

// Função para enviar o AgentID selecionado para exclusão
async function deleteSelectedAgent() {
    const user = netlifyIdentity.currentUser();
    const selectElement = document.getElementById('agent-select');
    const agentId = selectElement.value;
    const agentName = selectElement.options[selectElement.selectedIndex].textContent;

    if (parseInt(agentId) <= 1) { // Garante que IDs <= 1 não podem ser deletados
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
        
        // Usa o método DELETE e envia o ID como parâmetro de URL
        const response = await fetch(`/.netlify/functions/deleteAgent?agentId=${agentId}`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}` 
            }
        });

        if (response.ok) {
            alert(`✅ Agente '${agentName}' deletado com sucesso!`);
            // Recarrega a lista para remover o agente deletado
            loadAgentsList(); 
        } else {
            const data = await response.json();
            alert(`❌ Falha ao deletar: ${data.error || 'Erro desconhecido'}`);
        }

    } catch (error) {
        console.error('Erro ao deletar agente:', error);
        alert(`❌ Erro de conexão. Verifique o console.`);
    } finally {
        // O botão é reativado após o recarregamento em loadAgentsList,
        // mas garantimos que ele não fica desativado permanentemente em caso de erro.
        // deleteButton.disabled = false;
    }
}


// Inicializar agent
const agent = new FarmaceuticoAgent();

// --- Event Listeners de Inicialização e Gestão ---

// Inicializa a carga da lista de agentes após a inicialização do Identity
netlifyIdentity.on('init', () => {
    loadAgentsList();
});
// Também recarrega a lista após o login/logout
netlifyIdentity.on('login', loadAgentsList);
netlifyIdentity.on('logout', () => {
    document.getElementById('agent-select').innerHTML = '<option value="" disabled selected>Faça login para carregar.</option>';
    document.getElementById('delete-agent-btn').disabled = true; // Desativa o botão ao fazer logout
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
// NOVO: Listener para o botão de deletar
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