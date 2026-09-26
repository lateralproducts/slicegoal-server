
import axios from 'axios'
import { log } from './logging'
import { parseAndCombine } from '../util/functions'
const openai_key = process.env.OPENAI_API_KEY
const tagModel = process.env.OPENAI_TAG_MODEL || 'gpt-4o-mini'

export const queryLLMtags = async (text) => {
    const userText = (text || '').toString().trim().slice(0, 2000)
    let prompt = `You suggest tags.
Return ONLY a strict JSON array of unique, single, simple-word tags.
Do not include people's names or basic stop words like "to", "or".
Prefer abstractions and concepts. Order most meaningful first.
No prose, no code fences, no extra keys or text.`

    let chain = `For each of these words, produce tenses, versions, and abstractions.
Limit to 5 new words per input word.
Return ONLY a strict JSON array. No prose, no code fences, no extra keys.`

    try {
        const response1 = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: tagModel,
                max_tokens: 200,
                temperature: 0.2,
                messages: [
                    { role: "system", content: prompt },
                    { role: "user", content: userText },
                ],
            },
            {
                headers: {
                    'Authorization': `Bearer ${openai_key}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10_000,
            }
        );

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: tagModel,
                max_tokens: 200,
                temperature: 0.2,
                messages: [
                    { role: "system", content: chain },
                    { role: "user", content: response1.data.choices[0].message.content },
                ],
            },
            {
                headers: {
                    'Authorization': `Bearer ${openai_key}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10_000,
            }
        );
        
        const content1 = response1?.data?.choices?.[0]?.message?.content ?? ''
        const content2 = response?.data?.choices?.[0]?.message?.content ?? ''

        // Prefer strict JSON if provided
        let list1 = []
        let list2 = []
        try { list1 = JSON.parse(content1) } catch {}
        try { list2 = JSON.parse(content2) } catch {}
        if (!Array.isArray(list1) || !Array.isArray(list2)) {
            // Fallback to tolerant parser on any failure
            if (!Array.isArray(list1)) list1 = parseAndCombine(content1)
            if (!Array.isArray(list2)) list2 = parseAndCombine(content2)
        }

        // Merge, de-dupe case-insensitively, preserve order, cap at 10
        const seen = new Set()
        const merged = []
        for (const src of [list1, list2]) {
            for (const item of src) {
                if (typeof item !== 'string') continue
                const t = item.trim()
                if (!t) continue
                const key = t.toLowerCase()
                if (seen.has(key)) continue
                seen.add(key)
                merged.push(t)
                if (merged.length >= 10) break
            }
            if (merged.length >= 10) break
        }

        return JSON.stringify(merged)
    } catch (error) {
        log({type: 'error', source: 'queryLLMtags', message: error.message});
        throw new Error('Failed to fetch response from OpenAI')
    }
}