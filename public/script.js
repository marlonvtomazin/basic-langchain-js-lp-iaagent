class FarmaceuticoAgent {
    constructor() {
        this.chatHistory = [];
        this.apiUrl = '/.netlify/functions/agent';
        this.selectedAgentId = 1; // ID padrão: 1 (Farmacêutico)
        
        // NOVO: Adiciona listener para a seleção de agente
        document.getElementById('agent-select').addEventListener('change', (e) => {
            this.selectedAgentId = e.target.value;
            this.chatHistory = []; // Limpa o histórico ao mudar o agente
            document.getElementById('chat-messages').innerHTML = 
                `<div class="message assistant-message">Novo Agente (ID: ${this.selectedAgentId}) selecionado. Como posso ajudar?</div>`;
        });
    }

    async sendMessage(message) {
        // Obter o usuário logado do widget
        const user = netlifyIdentity.currentUser(); 
        
        // Verifica se o usuário está logado
        if (!user) {
            alert('Você precisa estar logado para usar o assistente.');
            netlifyIdentity.open(); // Abre o modal de login
            return "Por favor, faça login para continuar.";
        }

        // Obtém o token de autenticação JWT
        const token = await user.jwt(); 

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    // Adiciona o token no cabeçalho Authorization
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ 
                    message, 
                    chatHistory: this.chatHistory,
                    agentId: this.selectedAgentId // NOVO: Envia o ID do agente
                })
            });

            // Se o backend retornar 401 (Não autorizado), forçar logout
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
    messageDiv.textContent = message;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// NOVO: Função para carregar Agentes (Por enquanto, apenas o Agente Padrão)
async function loadAgentsList() {
    const selectElement = document.getElementById('agent-select');
    
    // Adiciona a opção padrão (Farmacêutico) - ID 1
    let defaultAgent = { AgentID: 1, AgentName: "Assistente Farmacêutico (Padrão)" };

    const option = document.createElement('option');
    option.value = defaultAgent.AgentID;
    option.textContent = defaultAgent.AgentName;
    selectElement.appendChild(option);

    // *******************************************************************
    // Lembrete: Para ter vários agentes, você precisará criar uma
    // segunda Netlify Function (ex: /getAgents) para buscar a lista
    // completa do MongoDB e popular este seletor.
    // *******************************************************************
}


// Inicializar agent
const agent = new FarmaceuticoAgent();

// Chama a função para popular a lista ao carregar a página
loadAgentsList();

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
    
    // Desativa o envio se o usuário não estiver logado.
    if (!netlifyIdentity.currentUser()) {
        alert('Por favor, faça login para enviar mensagens.');
        netlifyIdentity.open();
        return;
    }

    if (message) {
        // Adicionar mensagem do usuário
        addMessageToChat('user', message);
        input.value = '';
        input.disabled = true;
        
        // Mostrar indicador de carregamento
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message assistant-message';
        loadingDiv.textContent = '💭 Pensando...';
        document.getElementById('chat-messages').appendChild(loadingDiv);
        
        try {
            // Obter resposta do agent
            const response = await agent.sendMessage(message);
            
            // Remover indicador de carregamento
            loadingDiv.remove();
            
            // Adicionar resposta do assistente
            addMessageToChat('assistant', response);
        } catch (error) {
            loadingDiv.remove();
            addMessageToChat('assistant', 'Erro ao processar sua mensagem.');
        }
        
        input.disabled = false;
        input.focus();
    }
}

// Abre o modal de login quando o widget é inicializado
netlifyIdentity.on('init', user => {
    if (!user) {
        netlifyIdentity.open();
    }
});