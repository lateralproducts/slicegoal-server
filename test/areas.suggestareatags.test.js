/**
 * Resolver-level tests for suggestareatags
 * - Mocks OpenAI (axios via queryLLMtags)
 * - Mocks DB layer
 */

jest.mock('../src/LLM', () => ({
  queryLLMtags: jest.fn(),
}))

// Avoid pulling in the full server (which imports schedules/push/firebase)
jest.mock('../src/graphqlserver', () => ({
  triggererror: (message) => Promise.reject(new Error(message)),
}))

// Minimal stubs for users module functions imported by areas.js
jest.mock('../src/users', () => ({
  getuserid: jest.fn(() => 'user1'),
  getprofileid: jest.fn(() => 'profile1'),
  getwheelid: jest.fn(() => 'wheel1'),
  getname: jest.fn(() => 'User One'),
  updateUserOnboarding: jest.fn(),
  getipaddress: jest.fn(() => '127.0.0.1'),
}))

// Mock DB
let mockAreas = []
jest.mock('../src/database', () => {
  return {
    __esModule: true,
    default: {
      Get: async () => ({
        collection: (name) => {
          if (name !== 'areas') throw new Error('Unexpected collection ' + name)
          return {
            find: (query) => {
              const { wheelid, name } = query
              const regexes = (name && name.$in) || []
              const results = mockAreas.filter(a => {
                if (wheelid && a.wheelid !== wheelid) return false
                if (!regexes.length) return true
                return regexes.some(r => r.test(a.name))
              })
              return {
                toArray: async () => results,
              }
            },
          }
        },
      }),
    },
  }
})

const { queryLLMtags } = require('../src/LLM')
const { getwheelid } = require('../src/users')
const { resolvers } = require('../src/areas')

describe('Query.suggestareatags', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAreas = [
      { _id: 'a1', wheelid: 'wheel1', name: "Women's Health" },
      { _id: 'a2', wheelid: 'wheel1', name: 'Health' },
      { _id: 'a3', wheelid: 'wheel1', name: 'c++' },
      { _id: 'a4', wheelid: 'wheel1', name: '.*' },
      { _id: 'a5', wheelid: 'wheel1', name: '?' },
      { _id: 'a6', wheelid: 'wheel1', name: 'C#' },
      { _id: 'a7', wheelid: 'wheel1', name: 'Alpha' },
      { _id: 'a8', wheelid: 'wheel1', name: 'Beta' },
      { _id: 'a9', wheelid: 'wheel1', name: 'Gamma' },
      { _id: 'a10', wheelid: 'wheel1', name: 'Delta' },
      { _id: 'a11', wheelid: 'wheel1', name: 'Epsilon' },
      { _id: 'a12', wheelid: 'wheel1', name: 'Zeta' },
      { _id: 'a13', wheelid: 'wheel1', name: 'Eta' },
      { _id: 'a14', wheelid: 'wheel1', name: 'Theta' },
      { _id: 'a15', wheelid: 'wheel1', name: 'Iota' },
    ]
  })

  const ctx = { req: { session: { /* will be read via getwheelid mock */ } } }

  test('returns [] and does not call OpenAI on empty search', async () => {
    const res = await resolvers.Query.suggestareatags(null, { search: '   ' }, ctx)
    expect(res).toEqual([])
    expect(queryLLMtags).not.toHaveBeenCalled()
  })

  test('returns [] and does not call OpenAI when session has no wheel view', async () => {
    getwheelid.mockReturnValueOnce('no wheelid')
    const res = await resolvers.Query.suggestareatags(null, { search: 'text' }, ctx)
    expect(res).toEqual([])
    expect(queryLLMtags).not.toHaveBeenCalled()
  })

  test('handles apostrophes in model output', async () => {
    queryLLMtags.mockResolvedValueOnce(JSON.stringify(["women's health", 'health']))
    const res = await resolvers.Query.suggestareatags(null, { search: 'text' }, ctx)
    const names = res.map(r => r.name.toLowerCase())
    expect(names).toContain("women's health")
    expect(names).toContain('health')
  })

  test('escapes regex metacharacters from model output', async () => {
    queryLLMtags.mockResolvedValueOnce(JSON.stringify(['c++', '.*', '?', 'c#']))
    const res = await resolvers.Query.suggestareatags(null, { search: 'metas' }, ctx)
    const names = res.map(r => r.name)
    expect(names).toContain('c++')
    expect(names).toContain('?')
    expect(names).toContain('C#')
    // Must not overmatch everything due to '.*'
    expect(names).not.toContain('Health')
  })

  test('OpenAI failure surfaces as a GraphQL error', async () => {
    queryLLMtags.mockRejectedValueOnce(new Error('timeout'))
    await expect(
      resolvers.Query.suggestareatags(null, { search: 'fail' }, ctx)
    ).rejects.toThrow(/Tag suggestions are unavailable right now/)
  })

  test('returns areas in model order and caps final results at exactly 10', async () => {
    // 12 names that all exist in mockAreas
    const out = ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','C#','c++','?']
    queryLLMtags.mockResolvedValueOnce(JSON.stringify(out))
    const res = await resolvers.Query.suggestareatags(null, { search: 'many' }, ctx)
    expect(res.length).toBe(10)
    const expectedOrder = out.slice(0, 10)
    expect(res.map(r => r.name)).toEqual(expectedOrder)
  })
})
