jest.mock('axios', () => ({
  post: jest.fn(),
}))

const axios = require('axios')
jest.mock('../src/logging', () => ({ log: () => {} }))

describe('LLM.queryLLMtags (axios-level)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.OPENAI_TAG_MODEL = 'gpt-4o-mini'
  })

  function makeResp(content) {
    return {
      data: {
        choices: [
          { message: { content } }
        ]
      }
    }
  }

  test('passes 10s timeout and prefers strict JSON parsing', async () => {
    const { queryLLMtags } = require('../src/LLM')
    axios.post
      .mockResolvedValueOnce(makeResp('["alpha"]')) // first call
      .mockResolvedValueOnce(makeResp('["beta"]'))  // second call

    const result = await queryLLMtags('hello')
    const out = JSON.parse(result)
    expect(out).toEqual(['alpha', 'beta'])
    // Both axios calls include 10s timeout
    expect(axios.post.mock.calls[0][2].timeout).toBe(10000)
    expect(axios.post.mock.calls[1][2].timeout).toBe(10000)
  })

  test('fallback handles fenced and single-quoted arrays', async () => {
    const { queryLLMtags } = require('../src/LLM')
    axios.post
      .mockResolvedValueOnce(makeResp('```json\n["alpha"]\n```'))
      .mockResolvedValueOnce(makeResp("['beta']"))

    const result = await queryLLMtags('hello')
    expect(JSON.parse(result)).toEqual(['alpha', 'beta'])
  })

  test('merge order: list1 then list2 expansions, deduped', async () => {
    const { queryLLMtags } = require('../src/LLM')
    axios.post
      .mockResolvedValueOnce(makeResp('["alpha","beta"]'))
      .mockResolvedValueOnce(makeResp('["beta","gamma"]'))

    const result = await queryLLMtags('hello')
    expect(JSON.parse(result)).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('timeout surfaces as a thrown error from LLM.js', async () => {
    const { queryLLMtags } = require('../src/LLM')
    axios.post.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))
    await expect(queryLLMtags('hello')).rejects.toThrow(/Failed to fetch response from OpenAI/)
  })
})

