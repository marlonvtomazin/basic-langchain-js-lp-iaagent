const { GoogleGenerativeAI } = require("@google/generative-ai");

// CONFIGURAÇÃO DO AGENTE
const AGENT_CONFIG = {
    systemPrompt: `Você é um Assistente farmacêutico especializado em medicamentos e dosagens.
Use a ferramenta de busca quando precisar de informações atualizadas ou específicas.
Seja claro, conciso e forneça informações precisas.`,
};

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { message, chatHistory = [] } = JSON.parse(event.body);
        
        console.log('📤 Pergunta:', message);
        
        // Inicializar Google Generative AI diretamente
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1000,
            }
        });

        // Preparar histórico de conversa
        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: AGENT_CONFIG.systemPrompt }],
                },
                {
                    role: "model",
                    parts: [{ text: "Entendido. Sou um assistente farmacêutico especializado e estou pronto para ajudar." }],
                },
                ...chatHistory.map(msg => ({
                    role: msg.role === "human" ? "user" : "model",
                    parts: [{ text: msg.content }],
                }))
            ],
        });

        const result = await chat.sendMessage(message);
        const responseText = result.response.text();
        
        console.log('💊 Resposta:', responseText);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                response: responseText,
                chatHistory: [
                    ...chatHistory, 
                    { role: "human", content: message },
                    { role: "assistant", content: responseText }
                ]
            })
        };
    } catch (error) {
        console.error('❌ Erro completo:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: "Erro interno do servidor",
                details: error.message 
            })
        };
    }
};