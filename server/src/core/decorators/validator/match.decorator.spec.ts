import { validate } from 'class-validator';
import { Match } from './match.decorator';

class TestMatchDto {
  password!: string;

  @Match('password', { message: 'Passwords do not match' })
  passwordRepeat!: string;
}

describe('MatchDecorator', () => {
  let dto: TestMatchDto;

  beforeEach(() => {
    dto = new TestMatchDto();
  });

  it('should pass validation when values are identical', async () => {
    dto.password = 'Secret123!';
    dto.passwordRepeat = 'Secret123!';

    const errors = await validate(dto);

    expect(errors.length).toBe(0);
  });

  it('should return a validation error when values differ', async () => {
    dto.password = 'Secret123!';
    dto.passwordRepeat = 'Different123!';

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('Match');
    expect(errors[0].constraints?.Match).toBe('Passwords do not match');
  });

  it('should return an error when the related property does not exist', async () => {
    dto.passwordRepeat = 'Secret123!';

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
