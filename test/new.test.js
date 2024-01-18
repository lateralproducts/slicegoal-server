import DbConnection from '../src/database';
import { ObjectId } from 'mongodb';
import { newtest } from './testing'; // Replace with the actual module path
import { createNewViewProfile } from '../src/users'; // Replace with the actual module path
import { resolvers } from '../src/recaps';


jest.mock('../src/users', () => {
  const originalModule = jest.requireActual('../src/users');
  return {
    ...originalModule,
    anotherFunction: jest.fn(), // Mocking otherFunction
    
  };
});

jest.mock('../src/graphqlserver', () => ({
  triggererror: jest.fn()
}));

jest.mock('../src/emails', () => ({
    emailNewClient: jest.fn(),
    emailNewPersonal: jest.fn(),
    emailResetPassword: jest.fn(),
    newUserNotificationEmail: jest.fn()
}));

jest.mock('../src/website', () => ({
  sessiontrack: jest.fn(),
}));

jest.mock('../src/database', () => ({
  Get: jest.fn(),
}));

describe('newtest', () => {
    it('should fetch and return the user', async () => {
      const userId = '60fe4789be88d61281ab7316';
      const mockUser = { _id: new ObjectId(userId), name: 'John Doe' };
  
      // Mock the database connection and collection methods
      const findOneMock = jest.fn().mockResolvedValueOnce(mockUser);
      const collectionMock = jest.fn().mockReturnValueOnce({ findOne: findOneMock });
      DbConnection.Get.mockResolvedValueOnce({ collection: collectionMock });
  
      // Call the newtest function
      const result = await newtest(userId);
  
      // Verify that the database connection methods were called with the correct arguments
      expect(DbConnection.Get).toHaveBeenCalledTimes(1);
  
      // Verify that the collection method was called with the correct argument
      expect(DbConnection.Get).toHaveBeenCalledWith();
  
      // Verify that the findOne method was called with the correct argument
      expect(collectionMock).toHaveBeenCalledWith('users');
      expect(findOneMock).toHaveBeenCalledWith({ _id: new ObjectId(userId) });
  
      // Verify that the result matches the expected user
      expect(result).toEqual(mockUser);
    });
  
    // Add more test cases to cover different scenarios and error handling
});

describe('anothertest', () => {
    it('should fetch and return the user', async () => {
      const userid = '60fe4789be88d61281ab7316';
      const args = {
        profile: '60fe4789be88d612234b7316',
        email: 'test@test.com',
        firstname: 'First',
        lastname: 'Last',
      }
      const req = {
        session: {
          user: {_id: '60fe4789be88d61381ab7312'},
          view: {wheel: '60fe4789be88d61381ab7319'}
        }
      };

      const mockUser = { _id: new ObjectId(userid), name: 'John Doe' };
      // Create separate collection mocks for each collection
      const collectionMocks = {
        views: {
          insertOne: jest.fn().mockResolvedValueOnce({_id: "1231231231231"}),
          findOne: jest.fn().mockResolvedValueOnce(mockUser),
        },
        profiles: {
          insertOne: jest.fn(),
          find: jest.fn().mockResolvedValueOnce(mockUser),
        },
      };

      // Mock the database connection and collection methods
      const dbConnectionMock = { collection: (name) => collectionMocks[name] };
      DbConnection.Get.mockResolvedValueOnce(dbConnectionMock);

      //DbConnection.Get.mockResolvedValueOnce({ collection: collectionMock });
  
      // Call the newtest function
      const result = await createNewViewProfile(args, userid, req);
  
      // Verify that the database connection methods were called with the correct arguments
      expect(DbConnection.Get).toHaveBeenCalledTimes(2);
  
      // Verify that the collection method was called with the correct argument
      expect(DbConnection.Get).toHaveBeenCalledWith();
  
      // Verify that the findOne method was called with the correct argument
      //expect(collectionMocks.views.insertOne).toHaveBeenCalledWith({ _id: new ObjectId(userid) });
      //expect(collectionMocks.profiles.find).toHaveBeenCalledWith({ _id: new ObjectId(userid) });

      // Verify that the result matches the expected user
      //expect(result).toEqual(mockUser);
      console.log(result)
    });
  
    // Add more test cases to cover different scenarios and error handling
});


describe('recap Query', () => {
  it('returns the correct data for a given date and profile', async () => {

    // Mock the database connection and collection methods
    const findOneMock = jest.fn().mockResolvedValueOnce({recap: "This is a recap."});
    const collectionMock = jest.fn().mockReturnValueOnce({ findOne: findOneMock });
    DbConnection.Get.mockResolvedValueOnce({ collection: collectionMock });

    const args = { date: '2024-01-18' };
    const context = { req: { session: { /* session data */ } } };

    const result = await resolvers.Query.recap(null, args, context);

    // Assertion: Check if the result matches the expected output
    expect(result).toEqual({recap: "This is a recap."});
  });
  // More tests for different scenarios...
});