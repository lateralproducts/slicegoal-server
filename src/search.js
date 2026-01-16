import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';
import DbConnection from './database'
import { getprofileid, getwheelid } from './users'
import { log } from './logging';
import { startOfDay } from '../util/functions';

export const typeDefs = `
    extend type Query {
        searchglobal(search: String, areas: [AreaId], sources: [SourceTagIn], people: [PersonInput], swipe: Boolean): SearchGlobalResult
    }
`

export const schema = `
    type SearchGlobalResult {
        goals: [Goal]
        tasks: [Task]
        insights: [Insight]
        sources: [Source]
        people: [Person]
    }
`

export const resolvers = {
    Query: {
        searchglobal: async(_, {search}, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileid = getprofileid(req.session)
                
                const result = {
                    goals: [],
                    tasks: [],
                    insights: [],
                    sources: [],
                    people: []
                }

                // If search is provided, find areas with exact name match
                let searchMatchedAreaIds = []
                if (search) {
                    const Areas = db.collection('areas')
                    const wheelid = getwheelid(req.session)
                    const matchedAreas = await Areas.find({
                        wheelid,
                        name: search // Exact match
                    }).toArray()
                    searchMatchedAreaIds = matchedAreas.map(area => area._id.toString())
                }

                // Use search-matched areas
                let allAreaIds = []
                if (searchMatchedAreaIds.length > 0) {
                    allAreaIds = searchMatchedAreaIds
                }

                // Get all area tags in one query, then split by entity type
                let areaTaggedIds = {
                    goalids: [],
                    taskids: [],
                    insightids: [],
                    sourceids: [],
                    personids: []
                }

                if (allAreaIds.length > 0) {
                    const Tags = db.collection('insighttags')
                    const allAreaTags = await Tags.find({
                        profileid,
                        area: { $in: allAreaIds }
                    }).toArray()
                    
                    // Split tags by entity type
                    allAreaTags.forEach(tag => {
                        if (tag.goalid) areaTaggedIds.goalids.push(tag.goalid)
                        if (tag.taskid) areaTaggedIds.taskids.push(tag.taskid)
                        if (tag.insightid) areaTaggedIds.insightids.push(tag.insightid)
                        if (tag.sourceid) areaTaggedIds.sourceids.push(tag.sourceid)
                        if (tag.personid) areaTaggedIds.personids.push(tag.personid)
                    })
                    
                    // Remove duplicates
                    areaTaggedIds.goalids = [...new Set(areaTaggedIds.goalids)]
                    areaTaggedIds.taskids = [...new Set(areaTaggedIds.taskids)]
                    areaTaggedIds.insightids = [...new Set(areaTaggedIds.insightids)]
                    areaTaggedIds.sourceids = [...new Set(areaTaggedIds.sourceids)]
                    areaTaggedIds.personids = [...new Set(areaTaggedIds.personids)]
                }

                // Search Goals
                const Goals = db.collection('goals')
                let goalQuery = { profileid, complete: { $eq: null } }
                
                // Build OR conditions: tagged with areas OR partial text match
                let goalOrConditions = []
                
                if (allAreaIds.length > 0) {
                    // Goals can have area directly or through tags
                    const goalIdsFromTags = [...areaTaggedIds.goalids]
                    
                    // Get goals with direct area field
                    const directAreaGoals = await Goals.find({
                        profileid,
                        complete: { $eq: null },
                        area: { $in: allAreaIds }
                    }).toArray()
                    
                    directAreaGoals.forEach(goal => {
                        if (!goalIdsFromTags.includes(goal._id.toString())) {
                            goalIdsFromTags.push(goal._id.toString())
                        }
                    })
                    
                    if (goalIdsFromTags.length > 0) {
                        goalOrConditions.push({ _id: { $in: goalIdsFromTags.map(id => new ObjectId(id)) } })
                    }
                }
                
                if (search) {
                    goalOrConditions.push({ goal: new RegExp(search, 'i') })
                }
                
                if (goalOrConditions.length > 0) {
                    goalQuery.$or = goalOrConditions
                }
                
                result.goals = await Goals.find(goalQuery)
                    .sort({ datecreated: -1 })
                    .limit(20)
                    .toArray()

                // Search Tasks
                const Tasks = db.collection('tasks')
                let taskQuery = { profile: profileid }
                
                // Build OR conditions: tagged with areas OR partial text match
                let taskOrConditions = []
                
                if (allAreaIds.length > 0) {
                    if (areaTaggedIds.taskids.length > 0) {
                        taskOrConditions.push({ _id: { $in: areaTaggedIds.taskids.map(id => new ObjectId(id)) } })
                    }
                }
                
                if (search) {
                    taskOrConditions.push({ title: new RegExp(search, 'i') })
                }
                
                if (taskOrConditions.length > 0) {
                    taskQuery.$or = taskOrConditions
                }
                
                result.tasks = await Tasks.find(taskQuery)
                    .sort({ created: -1 })
                    .limit(20)
                    .toArray()

                // Search Insights
                const Insights = db.collection('insights')
                const InsightTags = db.collection('insighttags')
                let insightQuery = { profileid }
                
                // Build OR conditions for insights: tagged with areas OR partial text match
                let insightOrConditions = []
                
                if (allAreaIds.length > 0) {
                    if (areaTaggedIds.insightids.length > 0) {
                        const insightobjids = areaTaggedIds.insightids.map(insightid => new ObjectId(insightid))
                        insightOrConditions.push({ _id: { $in: insightobjids } })
                    }
                }
                
                if (search) {
                    insightOrConditions.push(
                        { answer: new RegExp(search, 'i') },
                        { prompt: new RegExp(search, 'i') }
                    )
                }
                
                if (insightOrConditions.length > 0) {
                    insightQuery.$or = insightOrConditions
                }
                
                result.insights = await Insights.find(insightQuery)
                    .sort({ datecreated: -1 })
                    .limit(20)
                    .toArray()

                // Search Sources
                const Sources = db.collection('sources')
                let sourceQuery = { profileid }
                
                // Build OR conditions: tagged with areas OR partial text match
                let sourceOrConditions = []
                
                if (allAreaIds.length > 0) {
                    if (areaTaggedIds.sourceids.length > 0) {
                        sourceOrConditions.push({ _id: { $in: areaTaggedIds.sourceids.map(id => new ObjectId(id)) } })
                    }
                }
                
                if (search) {
                    sourceOrConditions.push(
                        { name: new RegExp(search, 'i') },
                        { notes: new RegExp(search, 'i') }
                    )
                }
                
                if (sourceOrConditions.length > 0) {
                    sourceQuery.$or = sourceOrConditions
                }
                
                result.sources = await Sources.find(sourceQuery)
                    .sort({ accessedit: -1 })
                    .limit(20)
                    .toArray()

                // Search People
                const People = db.collection('people')
                let peopleQuery = { profileid }
                
                // Build OR conditions: tagged with areas OR partial text match
                let peopleOrConditions = []
                
                if (allAreaIds.length > 0) {
                    if (areaTaggedIds.personids.length > 0) {
                        peopleOrConditions.push({ _id: { $in: areaTaggedIds.personids.map(id => new ObjectId(id)) } })
                    }
                }
                
                if (search) {
                    peopleOrConditions.push({ name: new RegExp(search, 'i') })
                }
                
                if (peopleOrConditions.length > 0) {
                    peopleQuery.$or = peopleOrConditions
                }
                
                result.people = await People.find(peopleQuery)
                    .sort({ lasttagged: -1, created: -1 })
                    .limit(20)
                    .toArray()

                return result
            } catch (error) {
                console.error(error)
                return triggererror('Failed to perform global search')
            }
        }
    }
}
