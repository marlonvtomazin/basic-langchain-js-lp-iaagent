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
    // Garante que o contexto de login está disponível (Proteção de acesso)
    if (!context.clientContext || !context.clientContext.user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ 
                error: "Acesso não autorizado. Por favor, faça login." 
            })
        };
    }

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const db = await connectToDatabase(MONGODB_URI);
        const collection = db.collection(COLLECTION_NAME);

        // ✅ LINHA CORRIGIDA: Incluindo 'systemPrompt' e 'shouldSearchPrompt' na projeção
        const agents = await collection.find({})
            .project({ 
                AgentID: 1, 
                AgentName: 1, 
                createdBy: 1, 
                agentFunction: 1, 
                systemPrompt: 1, // <<< NOVO CAMPO
                shouldSearchPrompt: 1, // <<< NOVO CAMPO
                _id: 0 
            }) 
            .toArray();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(agents),
        };

    } catch (error) {
        console.error('❌ Erro na função getAgents:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Falha interna: ${error.message}` }),
        };
    }
};