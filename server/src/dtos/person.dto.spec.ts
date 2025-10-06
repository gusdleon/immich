import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PersonCreateDto } from 'src/dtos/person.dto';
import { describe, expect, it } from 'vitest';

describe('PersonCreateDto', () => {
  describe('Birth Date Validation', () => {
    it('should accept birth dates before 1922', async () => {
      const dto = plainToInstance(PersonCreateDto, { 
        name: 'Test Person', 
        birthDate: '1921-12-31' 
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept birth date of January 1, 1922', async () => {
      const dto = plainToInstance(PersonCreateDto, { 
        name: 'Test Person', 
        birthDate: '1922-01-01' 
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept birth date of January 2, 1922', async () => {
      const dto = plainToInstance(PersonCreateDto, { 
        name: 'Test Person', 
        birthDate: '1922-01-02' 
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept very old birth dates (1800s)', async () => {
      const dto = plainToInstance(PersonCreateDto, { 
        name: 'Test Person', 
        birthDate: '1850-06-15' 
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject future birth dates', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateString = futureDate.toISOString().split('T')[0];
      
      const dto = plainToInstance(PersonCreateDto, { 
        name: 'Test Person', 
        birthDate: futureDateString 
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.maxDateString).toContain('Birth date cannot be in the future');
    });

    it('should reject invalid date formats', async () => {
      const dto = plainToInstance(PersonCreateDto, { 
        name: 'Test Person', 
        birthDate: '1922-13-01' // invalid month
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept null birth date', async () => {
      const dto = plainToInstance(PersonCreateDto, { 
        name: 'Test Person', 
        birthDate: null 
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept undefined birth date', async () => {
      const dto = plainToInstance(PersonCreateDto, { 
        name: 'Test Person'
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});