class FarmaceuticoAgent {
    constructor() {
        this.chatHistory = [];
        this.apiUrl = '/.netlify/functions/agent';
        this.selectedAgentId = 1; // ID padrão: 1 (Farmacêutico)
        
        // NOVO: Adiciona listener para a seleção de agente
        document.getElementById('agent-select').addEventListener('change', (e) => {
            this.selectedAgentId = e.target.value;
            this.chatHistory = []; // Limpa o histórico ao mudar o agente
            
            const selectedName = e.target.options[e.target.selectedIndex].textContent;
            
            document.getElementById('chat-messages').innerHTML = 
                `<div class="message assistant-message">Agente **${selectedName}** selecionado. Novo chat iniciado.</div>`;
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
    messageDiv.innerHTML = message; // Usa innerHTML para permitir o **negrito** no nome do agente
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// FUNÇÃO MODIFICADA: Carrega agentes do Netlify Function
async function loadAgentsList() {
    const selectElement = document.getElementById('agent-select');
    selectElement.innerHTML = '<option value="" disabled selected>Carregando Agentes...</option>';
    
    try {
        const user = netlifyIdentity.currentUser();
        if (!user) {
             // Se não estiver logado, não tenta buscar. Deixa a mensagem de login.
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
        
        selectElement.innerHTML = ''; // Limpa o "Carregando"
        
        if (agents && agents.length > 0) {
            agents.forEach(agent => {
                const option = document.createElement('option');
                option.value = agent.AgentID;
                option.textContent = agent.AgentName;
                selectElement.appendChild(option);
            });
            // Define o primeiro agente como selecionado por padrão na inicialização
            if (agents[0]) {
                 agent.selectedAgentId = agents[0].AgentID;
                 addMessageToChat('assistant', `Agente **${agents[0].AgentName}** carregado. Comece a conversar!`);
            }
        } else {
             selectElement.innerHTML = '<option value="1">Assistente Farmacêutico (Padrão)</option>';
             addMessageToChat('assistant', 'Nenhum agente encontrado no DB. Usando o padrão.');
        }

    } catch (error) {
        console.error("Erro ao carregar lista de agentes:", error);
        selectElement.innerHTML = '<option value="1">Erro ao carregar (Usando Padrão)</option>';
    }
}

// Inicializar agent
const agent = new FarmaceuticoAgent();

// Inicializa a carga da lista de agentes após a inicialização do Identity
netlifyIdentity.on('init', () => {
    loadAgentsList();
});
// Também recarrega a lista após o login/logout
netlifyIdentity.on('login', loadAgentsList);
netlifyIdentity.on('logout', () => {
    document.getElementById('agent-select').innerHTML = '<option value="" disabled selected>Faça login para carregar.</option>';
    document.getElementById('chat-messages').innerHTML = 
        `<div class="message assistant-message">Olá! Por favor, faça login e selecione um Agente para começar.</div>`;
});


// Event listeners
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

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