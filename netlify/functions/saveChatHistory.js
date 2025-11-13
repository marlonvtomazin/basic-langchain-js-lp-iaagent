const { MongoClient } = require('mongodb');

// Configurações do Banco de Dados
let cachedDb = null;
const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'ai_agents_db'; 
const CHAT_COLLECTION_NAME = 'chat_history'; // Coleção para Histórico de Chat

// Função de conexão (reutilizada)
async function connectToDatabase(uri) {
    if (cachedDb) {
        return cachedDb;
    }
    const client = await MongoClient.connect(uri);
    const db = client.db(DB_NAME);
    cachedDb = db;
    return db;
}

exports.handler = async (event, context) => {
    // 1. Proteção de Acesso
    if (!context.clientContext || !context.clientContext.user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: "Acesso não autorizado. Por favor, faça login." })
        };
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const data = JSON.parse(event.body);
        const agentId = parseInt(data.agentId);
        const chatHistory = data.chatHistory; 
        const userEmail = context.clientContext.user.email;
        
        if (isNaN(agentId) || !Array.isArray(chatHistory)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Dados inválidos: AgentID ou chatHistory ausentes.' }),
            };
        }

        const db = await connectToDatabase(MONGODB_URI);
        const collection = db.collection(CHAT_COLLECTION_NAME);

        // 2. Cria ou Atualiza (upsert) o histórico
        const query = { AgentID: agentId, UserEmail: userEmail };
        const update = {
            $set: {
                history: chatHistory, // O array completo de mensagens
                updatedAt: new Date()
            },
            $setOnInsert: { // Define apenas na criação do documento
                createdAt: new Date()
            }
        };

        const result = await collection.updateOne(query, update, { upsert: true });

        console.log(`✅ Histórico salvo/atualizado para ${userEmail} e Agente ${agentId}`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'Histórico salvo com sucesso.' }),
        };

    } catch (error) {
        console.error('❌ Erro na função saveChatHistory:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Erro de servidor ao salvar histórico.' }),
        };
    }
};