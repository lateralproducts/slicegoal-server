
import axios from 'axios'
import { log } from './logging'
const openai_key = process.env.OPENAI_API_KEY

export const queryLLMtags = async (text) => {
    let prompt = `Give me a list of single simple word tags.
    Don\'t return people's names or basic words like "to", "or", etc.
    Add abstractions and concepts as tags.

    Order from most meaningful tags descending. 

    Return all results in a single array like this ['item1'] with no extra formatting.
    Respond with a single combined list of all the tags to a SINGLE list array (like an API). 
    
    This is the text: 
    `

    let chain = `
    Give me a list of words that are tenses and versions and abstractions for each these words:
    Limit to 5 new words per word.
    
    Return all results in a single array like this ['item1'] with no extra formatting.
    Respond with a single combined list of all the tags to a SINGLE list array. And human readable.

    `

    try {
        const response1 = await axios.post('https://api.openai.com/v1/chat/completions', 
        {
            model: "gpt-3.5-turbo",
            messages: [
                { role: "user", content: prompt + text }, 
                //{ role: "user", content: text },
            ]
        },{
            headers: {
                'Authorization': `Bearer ${openai_key}`,
                'Content-Type': 'application/json'
            }
        });

        const response = await axios.post('https://api.openai.com/v1/chat/completions', 
        {
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: chain },
                { role: "user", content: response1.data.choices[0].message.content },
            ]
        },{
            headers: {
                'Authorization': `Bearer ${openai_key}`,
                'Content-Type': 'application/json'
            }
        });
        
        const messageContent = response.data.choices[0].message.content;
        return messageContent;
    } catch (error) {
        log({type: 'error', source: 'queryLLMtags', message: error.message});
        res.status(500).json({ error: 'Failed to fetch response from OpenAI', details: error.message });
    }
}