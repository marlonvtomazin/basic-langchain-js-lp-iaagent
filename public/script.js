class FarmaceuticoAgent {
    constructor() {
        this.chatHistory = [];
        this.apiUrl = '/.netlify/functions/agent';
    }

    async sendMessage(message) {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message, 
                    chatHistory: this.chatHistory 
                })
            });

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