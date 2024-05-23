//import { createServer } from '@graphql-yoga/common';
import { ObjectId } from 'mongodb';
import { schema } from '../src/graphqlserver';
import { graphql } from 'graphql';
import DbConnection from '../src/database';


jest.mock('../src/database', () => ({
    Get: jest.fn(),
}));

jest.mock('node-schedule', () => ({
    scheduleJob: jest.fn(),
}));

describe('GraphQL Endpoint', () => {
    it('should return "Hello, world!" for the "hello" query', async () => {
        
        const mockinsights = [
            {
              _id: new ObjectId("66404e584f98d3b674fd46e1"),
              datetime: '2024-05-12T23:16:14.079Z',
              prompt: '',
              answer: 'New Source Insight 2',
              areatags: [],
              sources: [],
              taskid: '66404e4c4f98d3b674fd46df',
              serverversion: '13.0.0',
              uiversion: null,
              datecreated: '2024-05-12T05:06:32.263Z',
              lastedited: '2024-05-12T23:16:14.079Z',
              profileid: '64d6a53c8fe6f205016bc8b6',
              file: null
            },
            {
                _id: new ObjectId("66404e584f98d3b674fd46e3"),
                datetime: '2024-05-12T23:16:14.079Z',
                prompt: '',
                answer: 'New Source Insight 2',
                areatags: [],
                sources: [],
                taskid: '66404e4c4f98d3b674fd46df',
                serverversion: '13.0.0',
                uiversion: null,
                datecreated: '2024-05-12T05:06:32.263Z',
                lastedited: '2024-05-12T23:16:14.079Z',
                profileid: '64d6a53c8fe6f205016bc8b6',
                file: null
              }
        ]

        const insightListMock = jest.fn().mockResolvedValueOnce(mockinsights);
        const toArrayMock = jest.fn().mockReturnValueOnce({ toArray: insightListMock });
        const limitMock = jest.fn().mockReturnValueOnce({ limit: toArrayMock });
        const skipMock = jest.fn().mockReturnValueOnce({ skip: limitMock });
        const sortMock = jest.fn().mockReturnValueOnce({ sort: skipMock });
        const insightsMock = jest.fn().mockReturnValueOnce({ find: sortMock });
        DbConnection.Get.mockResolvedValueOnce({ collection: insightsMock });

        const query = `
            query {
                insightList { _id }
            }
        `;

        const response = await graphql(schema, query, null, { req: {session: {profile: {_id: '37123123123123'}}}});
        console.log(response.data.insightList)
        expect(response.data.insightList).toEqual([{_id: "66404e584f98d3b674fd46e1"}, {_id: "66404e584f98d3b674fd46e3"}]);
    });
});



