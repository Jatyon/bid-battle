import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class InitSocialAccounts1770549563587 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'social_accounts',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'provider',
            type: 'enum',
            enum: ['google'],
          },
          {
            name: 'provider_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'user_id',
            type: 'int',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
            onUpdate: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('social_accounts', [new TableIndex({ name: 'IDX_SOCIAL_ACCOUNTS_PROVIDER_ID', columnNames: ['provider_id'] })]);

    await queryRunner.createIndex(
      'social_accounts',
      new TableIndex({
        name: 'UQ_SOCIAL_ACCOUNTS_PROVIDER_ID',
        columnNames: ['provider', 'provider_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'social_accounts',
      new TableForeignKey({
        name: 'FK_SOCIAL_ACCOUNTS_USER',
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('social_accounts');
  }
}
