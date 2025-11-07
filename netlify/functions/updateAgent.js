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

    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const agentData = JSON.parse(event.body);
        const agentId = parseInt(agentData.AgentID);

        // Validação básica para evitar edição do Agente Padrão (ID 1)
        if (isNaN(agentId) || agentId <= 1 || !agentData.AgentName || !agentData.systemPrompt) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Dados do agente inválidos ou tentativa de editar ID 1.' }),
            };
        }
        
        // Dados para atualização (usa $set para atualizar apenas os campos fornecidos)
        const updateDoc = {
            $set: {
                AgentName: agentData.AgentName,
                agentFunction: agentData.agentFunction,
                systemPrompt: agentData.systemPrompt,
                shouldSearchPrompt: agentData.shouldSearchPrompt,
                updatedAt: new Date(), // Adiciona um timestamp de atualização
            },
        };

        const db = await connectToDatabase(MONGODB_URI);
        const collection = db.collection(COLLECTION_NAME);

        // Atualiza o documento com o AgentID correspondente
        const result = await collection.updateOne(
            { AgentID: agentId },
            updateDoc
        );

        if (result.matchedCount === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: `Agente ID ${agentId} não encontrado.` }),
            };
        }

        console.log(`✅ Agente atualizado: ID ${agentId}`);
        return {
            statusCode: 200, 
            headers,
            body: JSON.stringify({ message: `Agente ID ${agentId} atualizado com sucesso.`, AgentName: agentData.AgentName }),
        };

    } catch (error) {
        console.error('❌ Erro na função updateAgent:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Falha interna: ${error.message}` }),
        };
    }
};