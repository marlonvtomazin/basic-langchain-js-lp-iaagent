const { MongoClient } = require('mongodb');

// Configurações do Banco de Dados
let cachedDb = null;
const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'ai_agents_db'; 
const AGENTS_COLLECTION_NAME = 'agents'; 
const HISTORY_COLLECTION_NAME = 'chat_history'; // ✅ NOVO: Coleção de histórico

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
    
    // 2. Verificação de permissão (Obrigatória para deletar agentes criados)
    const userEmail = context.clientContext.user.email;
    
    try {
        const db = await connectToDatabase(MONGODB_URI);
        const agentCollection = db.collection(AGENTS_COLLECTION_NAME);
        
        // *Verificação de Criador*
        const agentRecord = await agentCollection.findOne({ AgentID: agentId });
        if (!agentRecord || agentRecord.createdBy !== userEmail) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ error: `Acesso negado. Você não é o criador do Agente ID ${agentId}.` }),
            };
        }
        
        // 3. Deleta o Agente da coleção 'agents'
        const result = await agentCollection.deleteOne({ AgentID: agentId });

        if (result.deletedCount === 1) {
            console.log(`✅ Agente deletado: ID ${agentId}`);
            
            // 4. Deletar histórico de chat associado ao agente
            const historyCollection = db.collection(HISTORY_COLLECTION_NAME);
            // Deleta o histórico para TODOS os usuários que conversaram com este agente
            const deleteHistoryResult = await historyCollection.deleteMany({ agentId: agentId });
            
            console.log(`✅ Históricos deletados: ${deleteHistoryResult.deletedCount} registros excluídos da coleção chat_history.`);
            
            return {
                statusCode: 200, 
                headers,
                body: JSON.stringify({ message: `Agente ID ${agentId} e seus ${deleteHistoryResult.deletedCount} históricos deletados com sucesso.` }),
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