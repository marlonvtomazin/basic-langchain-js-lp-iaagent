class FarmaceuticoAgent {
    constructor() {
        this.chatHistory = [];
        // O Netlify Identity é carregado globalmente no index.html
        this.apiUrl = '/.netlify/functions/agent';
    }

    async sendMessage(message) {
        // NOVO: Obter o usuário logado do widget
        const user = netlifyIdentity.currentUser(); 
        
        // NOVO: Verifica se o usuário está logado
        if (!user) {
            alert('Você precisa estar logado para usar o assistente.');
            netlifyIdentity.open(); // Abre o modal de login
            return "Por favor, faça login para continuar.";
        }

        // NOVO: Obtém o token de autenticação JWT
        const token = await user.jwt(); 

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    // NOVO: Adiciona o token no cabeçalho Authorization
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ 
                    message, 
                    chatHistory: this.chatHistory 
                })
            });

            // NOVO: Se o backend retornar 401 (Não autorizado), forçar logout
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

// Inicializar agent
const agent = new FarmaceuticoAgent();

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
    
    // NOVO: Desativa o envio se o usuário não estiver logado. A verificação principal está no agente.
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

// NOVO: Abre o modal de login quando o widget é inicializado
netlifyIdentity.on('init', user => {
    if (!user) {
        netlifyIdentity.open();
    }
});