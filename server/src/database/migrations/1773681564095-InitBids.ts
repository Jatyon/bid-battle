import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class InitBids1773681564095 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'bids',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'amount',
            type: 'bigint',
            unsigned: true,
          },
          {
            name: 'auction_id',
            type: 'int',
          },
          {
            name: 'user_id',
            type: 'int',
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
      'bids',
      new TableForeignKey({
        columnNames: ['auction_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'auctions',
        onDelete: 'CASCADE',
        name: 'FK_BIDS_AUCTION_ID',
      }),
    );

    await queryRunner.createForeignKey(
      'bids',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
        name: 'FK_BIDS_USER_ID',
      }),
    );

    await queryRunner.createIndices('bids', [
      new TableIndex({
        name: 'IDX_BIDS_AUCTION_ID_AMOUNT',
        columnNames: ['auction_id', 'amount'],
      }),
      new TableIndex({
        name: 'IDX_BIDS_USER_ID',
        columnNames: ['user_id'],
      }),
      new TableIndex({
        name: 'IDX_BIDS_AUCTION_ID_CREATED_AT',
        columnNames: ['auction_id', 'created_at'],
      }),
      new TableIndex({
        name: 'IDX_BIDS_AUCTION_ID',
        columnNames: ['auction_id'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('bids', 'IDX_BIDS_AUCTION_ID');
    await queryRunner.dropIndex('bids', 'IDX_BIDS_AUCTION_ID_CREATED_AT');
    await queryRunner.dropIndex('bids', 'IDX_BIDS_USER_ID');
    await queryRunner.dropIndex('bids', 'IDX_BIDS_AUCTION_ID_AMOUNT');

    await queryRunner.dropForeignKey('bids', 'FK_BIDS_USER_ID');
    await queryRunner.dropForeignKey('bids', 'FK_BIDS_AUCTION_ID');

    await queryRunner.dropTable('bids');
  }
}
