import datetime
import random
import os
import sys
import bcrypt
from sqlalchemy.orm import Session

# Add the root directory to path to enable local app imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from backend.app.db.session import engine, Base, SessionLocal
from backend.app.models.models import User, Product, Order, WebEvent

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def seed_database():
    db = SessionLocal()
    try:
        # Create tables
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        print("Initializing seed users...")
        # 1. Create seed users
        users = [
            User(
                username="admin",
                email="admin@data-analysis-agent.ai",
                hashed_password=get_password_hash("admin123"),
                role="admin"
            ),
            User(
                username="analyst",
                email="analyst@data-analysis-agent.ai",
                hashed_password=get_password_hash("analyst123"),
                role="analyst"
            ),
            User(
                username="demouser",
                email="demo@data-analysis-agent.ai",
                hashed_password=get_password_hash("demo123"),
                role="viewer"
            )
        ]
        db.add_all(users)
        db.commit()

        # Retrieve users to link to orders
        db_users = db.query(User).all()

        print("Initializing seed products...")
        # 2. Create products
        products = [
            Product(name="Apex Wireless Keyboard", category="Electronics", price=89.99, cost=45.00, stock=200),
            Product(name="Quantum Noise-Canceling Headphones", category="Electronics", price=299.99, cost=130.00, stock=150),
            Product(name="ErgoComfort Office Chair", category="Furniture", price=349.99, cost=160.00, stock=80),
            Product(name="Lumina Desk Lamp", category="Furniture", price=49.99, cost=20.00, stock=120),
            Product(name="Titanium Water Bottle", category="Accessories", price=39.99, cost=12.00, stock=500),
            Product(name="Leather Travel Duffle Bag", category="Accessories", price=189.99, cost=80.00, stock=90),
            Product(name="Python Data Analytics Course", category="Software", price=99.00, cost=0.00, stock=9999),
            Product(name="data_analysis_agent Pro License (Annual)", category="Software", price=499.00, cost=0.00, stock=9999),
            Product(name="UltraFit Running Shoes", category="Apparel", price=129.99, cost=55.00, stock=110),
            Product(name="Merino Wool Sweater", category="Apparel", price=79.99, cost=30.00, stock=140),
        ]
        db.add_all(products)
        db.commit()

        print("Generating historical orders and web traffic events (12 months)...")
        # 3. Generate 12 months of daily orders and traffic events
        end_date = datetime.datetime.utcnow().date()
        start_date = end_date - datetime.timedelta(days=365)
        
        current_date = start_date
        total_orders = 0
        total_events = 0

        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            
            # Anomalous dates configuration
            is_black_friday_crash = (date_str == "2025-11-28")
            is_spring_viral_campaign = (date_str >= "2026-03-15" and date_str <= "2026-03-18")
            
            # Determine sales volume factors
            day_of_week = current_date.weekday()
            is_weekend = (day_of_week >= 5)
            
            # Base parameters
            base_orders_count = 20
            base_traffic_count = 150
            
            if is_black_friday_crash:
                # Anomaly: Drop in sales (system crashed)
                orders_count = random.randint(0, 2)
                traffic_count = random.randint(800, 1000) # huge traffic trying to load page
            elif is_spring_viral_campaign:
                # Anomaly: Massive surge in sales
                orders_count = random.randint(80, 120)
                traffic_count = random.randint(600, 900)
            else:
                # Seasonality & Weekend effect
                multiplier = 1.0
                if current_date.month == 12: # December Christmas bump
                    multiplier *= 1.8
                elif current_date.month in [6, 7]: # Summer dip
                    multiplier *= 0.8
                
                if is_weekend:
                    multiplier *= 0.7
                    
                orders_count = int(random.randint(10, 25) * multiplier)
                traffic_count = int(random.randint(120, 200) * multiplier)

            # Insert Orders
            for _ in range(orders_count):
                user = random.choice(db_users)
                product = random.choice(products)
                quantity = random.randint(1, 3)
                if product.category == "Software":
                    quantity = 1 # generally buy 1 license
                
                revenue = product.price * quantity
                cost = product.cost * quantity
                profit = revenue - cost
                
                # Distribute purchase times throughout the day
                hour = random.randint(0, 23)
                minute = random.randint(0, 59)
                order_time = datetime.datetime.combine(current_date, datetime.time(hour, minute))
                
                order = Order(
                    user_id=user.id,
                    product_id=product.id,
                    quantity=quantity,
                    revenue=revenue,
                    cost=cost,
                    profit=profit,
                    order_date=order_time
                )
                db.add(order)
                total_orders += 1

            # Insert Web traffic events
            for _ in range(traffic_count):
                hour = random.randint(0, 23)
                minute = random.randint(0, 59)
                event_time = datetime.datetime.combine(current_date, datetime.time(hour, minute))
                
                # Determine event type
                event_type = random.choice(["page_view", "page_view", "page_view", "cart", "purchase"])
                
                # Default performance details
                status_code = 200
                response_time = random.uniform(80.0, 350.0) # normal latency 80-350ms
                
                if is_black_friday_crash:
                    # System crash results in 500 errors and high response times (timeouts)
                    status_code = random.choice([500, 500, 502, 504, 200]) # 80% failure rate
                    response_time = random.uniform(3000.0, 8000.0) # extreme lag
                    event_type = "api_call"
                elif random.random() < 0.02: # 2% baseline page error rate
                    status_code = random.choice([404, 500])
                    response_time = random.uniform(200.0, 1500.0)
                
                path = random.choice(["/home", "/product", "/cart", "/checkout", "/api/v1/query"])
                
                web_event = WebEvent(
                    event_date=event_time,
                    event_type=event_type,
                    status_code=status_code,
                    response_time=response_time,
                    path=path
                )
                db.add(web_event)
                total_events += 1

            # Flush daily data to keep memory usage low
            if total_orders % 500 == 0:
                db.commit()
                
            current_date += datetime.timedelta(days=1)

        db.commit()
        print(f"Database successfully pre-seeded with {total_orders} orders and {total_events} web events.")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
