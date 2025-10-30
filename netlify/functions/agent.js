const { config } = require('dotenv');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { TavilySearch } = require("@langchain/tavily");

config();

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
        
        const llm = new ChatGoogleGenerativeAI({
            model: 'gemini-2.5-flash',
            temperature: 0.2,
        });

        const searchTool = new TavilySearch({ maxResults: 2 });
        
        const response = await llm.invoke([
            {
                role: "system",
                content: "Você é um Assistente farmacêutico especializado em medicamentos e dosagens. Use a ferramenta de busca quando precisar de informações atualizadas. Seja claro e conciso nas respostas."
            },
            ...chatHistory,
            { role: "human", content: message }
        ], { tools: [searchTool] });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                response: response.content,
                chatHistory: [...chatHistory, { role: "human", content: message }]
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};