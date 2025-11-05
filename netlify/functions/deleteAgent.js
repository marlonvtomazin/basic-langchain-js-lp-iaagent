const { MongoClient } = require('mongodb');

// Configurações do Banco de Dados
let cachedDb = null;
const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'ai_agents_db'; 
const COLLECTION_NAME = 'agents'; 

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
    // Proteção de acesso: Apenas usuários logados
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

    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    // O ID é passado via query string (ex: ?agentId=2)
    const agentIdString = event.queryStringParameters.agentId;
    const agentId = parseInt(agentIdString);

    if (isNaN(agentId) || agentId <= 1) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'AgentID inválido ou ID 1 (padrão) não pode ser excluído.' }),
        };
    }

    try {
        const db = await connectToDatabase(MONGODB_URI);
        const collection = db.collection(COLLECTION_NAME);

        // Deleta o documento com o AgentID correspondente
        const result = await collection.deleteOne({ AgentID: agentId });

        if (result.deletedCount === 1) {
            console.log(`✅ Agente deletado: ID ${agentId}`);
            return {
                statusCode: 200, 
                headers,
                body: JSON.stringify({ message: `Agente ID ${agentId} deletado com sucesso.` }),
            };
        } else {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: `Agente ID ${agentId} não encontrado.` }),
            };
        }

    } catch (error) {
        console.error('❌ Erro na função deleteAgent:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Falha interna: ${error.message}` }),
        };
    }
};