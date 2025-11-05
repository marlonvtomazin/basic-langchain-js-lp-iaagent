const { MongoClient } = require('mongodb');

// Configurações do Banco de Dados
let cachedDb = null;
const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'ai_agents_db'; 
const COLLECTION_NAME = 'agents'; 

// Função de conexão (sem opções obsoletas)
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

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const agentData = JSON.parse(event.body);

        // 1. Conexão e Definição da Coleção
        const db = await connectToDatabase(MONGODB_URI);
        const collection = db.collection(COLLECTION_NAME);

        // 2. Encontrar o próximo AgentID (Auto-incremento manual)
        // Busca o maior AgentID existente
        const maxAgent = await collection.find({})
            .sort({ AgentID: -1 }) // Ordena do maior para o menor
            .limit(1)
            .toArray();
        
        const nextAgentID = (maxAgent.length > 0) ? maxAgent[0].AgentID + 1 : 1;

        // 3. Montar o Objeto Final para Inserção
        const newAgent = {
            AgentID: nextAgentID,
            AgentName: agentData.AgentName,
            agentFunction: agentData.agentFunction,
            systemPrompt: agentData.systemPrompt,
            shouldSearchPrompt: agentData.shouldSearchPrompt,
            createdBy: agentData.createdBy, // e-mail do usuário do Netlify Identity
            createdAt: new Date(),
        };

        // 4. Inserir no Banco de Dados
        await collection.insertOne(newAgent);

        console.log(`✅ Novo Agente criado: ID ${nextAgentID} por ${agentData.createdBy}`);

        return {
            statusCode: 201, // 201 Created
            headers,
            body: JSON.stringify({ 
                message: "Agente criado com sucesso",
                AgentID: nextAgentID,
                AgentName: newAgent.AgentName
            }),
        };

    } catch (error) {
        console.error('❌ Erro na função createAgent:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Falha interna: ${error.message}` }),
        };
    }
};