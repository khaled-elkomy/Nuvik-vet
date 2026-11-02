# Nuvik Vet demo

The demo runs against the isolated `nuvik-dev-postgres` PostgreSQL 16 container and the `nuvik_dev` database. PostgreSQL is published only on `127.0.0.1:55432`.

## Start

From the repository root, run:

```powershell
.\demo-start.ps1
```

The script checks the ignored local configuration, starts the database container if it is stopped, builds the API, then opens separate PowerShell windows for the API on port 4108 and Vite on port 5178. Open <http://localhost:5178>.

The demo login is in `.local/bootstrap-credentials.txt`. Keep that file and the local environment files private; they are ignored by Git.

## Demo areas

- Customers and animals: create customer records, add species and breeds, register animals, and link each animal to its primary owner.
- Catalog and inventory: add products and services, variants, barcodes, and opening stock.
- Point of sale: scan or search products, take split payments, record credit sales, and print a receipt. Cash sales require an open cashier shift.
- Invoices: search invoices, review payments and balances, and receive customer payments allocated to the oldest open invoices first.

## Stop

Close the API and Vite windows when finished. The PostgreSQL container and its `nuvik-dev-pgdata` volume remain available for the next demo session.
