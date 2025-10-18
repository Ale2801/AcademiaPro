"""Utility script to populate demo data for local environments."""

from src.db import init_db
from src.seed import ensure_demo_data


def main() -> None:
	"""Initialise the database schema and load deterministic demo data."""
	init_db()
	ensure_demo_data()


if __name__ == "__main__":
	main()
