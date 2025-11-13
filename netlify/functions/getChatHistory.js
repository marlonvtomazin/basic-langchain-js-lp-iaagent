const { MongoClient } = require('mongodb');

// Configurações do Banco de Dados
let cachedDb = null;
const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'ai_agents_db'; 
const COLLECTION_NAME = 'chat_history'; // Coleção sugerida

// Função de conexão
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
    // 1. Proteção de acesso: Apenas usuários logados
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

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    // O ID do agente é passado via query string (ex: ?agentId=2)
    const agentIdString = event.queryStringParameters.agentId;
    const agentId = parseInt(agentIdString);
    // 2. Obtém o email do usuário logado via Netlify Identity
    const userEmail = context.clientContext.user.email; 

    if (isNaN(agentId)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'AgentID inválido.' }),
        };
    }

    try {
        const db = await connectToDatabase(MONGODB_URI);
        const collection = db.collection(COLLECTION_NAME);

        // 3. Busca o histórico específico para este usuário e agente
        const historyRecord = await collection.findOne({ 
            agentId: agentId,
            userEmail: userEmail
        });

        if (historyRecord && historyRecord.chatHistory && historyRecord.chatHistory.length > 0) {
            return {
                statusCode: 200, 
                headers,
                // Retorna o array de histórico contido no documento
                body: JSON.stringify({ chatHistory: historyRecord.chatHistory }),
            };
        } else {
            // 4. Retorna 404 se não houver histórico para sinalizar ao frontend que é um novo chat
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ chatHistory: [] }), 
            };
        }

    } catch (error) {
        console.error('❌ Erro na função getChatHistory:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Falha interna: ${error.message}` }),
        };
    }
};