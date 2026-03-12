import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class InitAuction1773160752712 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'auctions',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
          },
          {
            name: 'image_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'starting_price',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'current_price',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'end_time',
            type: 'timestamp',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['ACTIVE', 'ENDED', 'CANCELED'],
            default: "'ACTIVE'",
          },
          {
            name: 'owner_id',
            type: 'int',
          },
          {
            name: 'winner_id',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'auctions',
      new TableForeignKey({
        columnNames: ['owner_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'RESTRICT',
        name: 'FK_AUCTIONS_OWNER_ID',
      }),
    );

    await queryRunner.createForeignKey(
      'auctions',
      new TableForeignKey({
        columnNames: ['winner_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
        name: 'FK_AUCTIONS_WINNER_ID',
      }),
    );

    await queryRunner.createIndices('auctions', [
      new TableIndex({
        name: 'IDX_AUCTIONS_STATUS_END_TIME',
        columnNames: ['status', 'end_time'],
      }),
      new TableIndex({
        name: 'IDX_AUCTIONS_OWNER_ID',
        columnNames: ['owner_id'],
      }),
      new TableIndex({
        name: 'IDX_AUCTIONS_WINNER_ID',
        columnNames: ['winner_id'],
      }),
      new TableIndex({
        name: 'IDX_AUCTIONS_STATUS',
        columnNames: ['status'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('auctions', 'IDX_AUCTIONS_STATUS');
    await queryRunner.dropIndex('auctions', 'IDX_AUCTIONS_WINNER_ID');
    await queryRunner.dropIndex('auctions', 'IDX_AUCTIONS_OWNER_ID');
    await queryRunner.dropIndex('auctions', 'IDX_AUCTIONS_STATUS_END_TIME');

    await queryRunner.dropForeignKey('auctions', 'FK_AUCTIONS_WINNER_ID');
    await queryRunner.dropForeignKey('auctions', 'FK_AUCTIONS_OWNER_ID');

    await queryRunner.dropTable('auctions');
  }
}
