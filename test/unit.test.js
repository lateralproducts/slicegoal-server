import { ObjectId } from 'mongodb';
import { getname, getprofileid, getuserid, getwheelid, getipaddress } from '../src/users';

jest.mock('../src/database', () => ({
  Get: jest.fn(),
}));

jest.mock('../src/graphqlserver', () => ({
  triggererror: jest.fn()
}));

describe('users', () => {
  describe('getname', () => {
    it('should return the full name', () => {
      const firstname = 'John';
      const lastname = 'Doe';
      const email = 'john.doe@example.com';

      const result = getname(firstname, lastname, email);

      expect(result).toBe('John Doe');
    });

    it('should return the email if no name is provided', () => {
      const email = 'john.doe@example.com';

      const result = getname(null, null, email);

      expect(result).toBe(email);
    });
  });

  describe('getprofileid', () => {
    it('should return the profile id', () => {
      const session = { profile: { _id: new ObjectId('664d3d0279e3dc0aef322973') } };

      const result = getprofileid(session);

      expect(result).toBe('664d3d0279e3dc0aef322973');
    });

    it('should return null if no profile is in the session', () => {  
      const session = {};

      const result = getprofileid(session);

      expect(result).toBe(null);
    });
  });

  describe('getuserid', () => {
    it('should return the user id', () => {
      const session = { user: { _id: new ObjectId('664d3d0279e3dc0aef322973') } };

      const result = getuserid(session);

      expect(result).toBe('664d3d0279e3dc0aef322973');
    });

    it('should return null if no user is in the session', () => {
      const session = {};

      const result = getuserid(session);

      expect(result).toBe(null);
    });
  });

  describe('getwheelid', () => {
    it('should return the wheel id', () => {
      const session = { view: { wheel: '664d3d0279e3dc0aef322973' } };

      const result = getwheelid(session);

      expect(result).toBe('664d3d0279e3dc0aef322973');
    });

    it('should return null if no view is in the session', () => {
      const session = {};

      const result = getwheelid(session);

      expect(result).toBe(null);
    });
  });

  describe('getipaddress', () => {
    it('should return the ip address', () => {
      const request = { headers: { 'x-forwarded-for': '127.0.0.1' } };

      const result = getipaddress(request);

      expect(result).toBe('127.0.0.1');
    });

    it('should return null if no headers are in the request', () => {
      const request = {};

      const result = getipaddress(request);

      expect(result).toBe(null);
    });
  });
});