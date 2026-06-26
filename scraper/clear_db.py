import database as db

conn = db.get_connection()
cur = conn.cursor()

print("Deleting all data...")
cur.execute('DELETE FROM "Article";')
cur.execute('DELETE FROM "Cluster";')
cur.execute('DELETE FROM "IngestJob";')

conn.commit()
cur.close()
conn.close()

print("Database cleared successfully!")
