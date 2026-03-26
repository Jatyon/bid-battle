import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class InitUserPreferences1772805128870 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_preferences',
        columns: [
          {
            name: 'user_id',
            type: 'int',
            isPrimary: true,
          },
          {
            name: 'lang',
            type: 'enum',
            enum: ['en', 'pl'],
            default: "'en'",
          },
          {
            name: 'notify_on_outbid',
            type: 'boolean',
            default: true,
          },
          {
            name: 'notify_on_auction_end',
            type: 'boolean',
            default: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'user_preferences',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
        name: 'FK_USER_PREFERENCES_USER_ID',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_preferences');
  }
}
