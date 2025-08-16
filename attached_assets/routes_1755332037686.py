from flask import Blueprint, request, jsonify
from sqlalchemy import text
from db import engine
from datetime import datetime, timedelta
from dateutil.parser import parse

api = Blueprint('api', __name__)

# --- Helper functions ---

def get_time(time_id):
    sql = text("""
        SELECT Time
        FROM tblTimes
        WHERE ID = :tid
    """)
    with engine.connect() as conn:
        result = conn.execute(sql, {"tid": time_id}).fetchone()
        
        if result and result.Time:
            # result.Time is a time object or string like '13:00:00'
            time_obj = datetime.strptime(str(result.Time), "%H:%M:%S")
            formatted_time = time_obj.strftime("%I:%M %p").lstrip("0")  # e.g. "1:00 PM"
            
            return formatted_time
        
        return None


def find_inquiry_by_contact_phone(contact_num):
    # Step 1: Find the Inquiry ID from the parent's contact number
    parent_sql = text("""
        SELECT ID AS InquiryID, Email, ContactPhone
        FROM tblInquiry
        WHERE ContactPhone = :cn
    """)

    with engine.connect() as conn:
        parent_result = conn.execute(parent_sql, {"cn": contact_num}).fetchone()

        if not parent_result:
            return None  # No parent found

        inquiry_id = parent_result.InquiryID

        # Step 2: Find the student(s) linked to that Inquiry ID
        student_sql = text("""
            SELECT ID, FirstName, LastName
            FROM tblstudents
            WHERE InquiryID = :inquiry_id
        """)
        student_results = conn.execute(student_sql, {"inquiry_id": inquiry_id}).fetchall()

        return {
            "inquiry": dict(parent_result._mapping),
            "students": [dict(row._mapping) for row in student_results]
        }


def get_hours_balance(inquiry_id):
    conn = engine.raw_connection()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.callproc("dpinkney_TC.dbo.USP_Report_AccountBalance", [inquiry_id])

        # Skip first result set
        while cursor.nextset():
            break

        # Second result set (balance-related info)
        balance_row = cursor.fetchone()
        balance_columns = [col[0] for col in cursor.description] if cursor.description else []
        balance_data = dict(zip(balance_columns, balance_row)) if balance_row else {}

        # Third result set (optional, in case you need it later)
        while cursor.nextset():
            break

        extra_rows = cursor.fetchall()
        extra_columns = [col[0] for col in cursor.description] if cursor.description else []
        extra_data = [dict(zip(extra_columns, row)) for row in extra_rows]

        # Define a helper to safely cast to float
        def safe_float(val):
            try:
                result = float(val) if val is not None else 0.0
                return result
            except (TypeError, ValueError):
                return 0.0

        # Calculate remaining hours
        purchases = safe_float(balance_data.get("Purchases"))
        attendance = safe_float(balance_data.get("AttendancePresent"))
        absences = safe_float(balance_data.get("UnexcusedAbsences"))
        adjustments = safe_float(balance_data.get("MiscAdjustments"))
        
        remaining = purchases + attendance + absences + adjustments

        return {
            "balance": balance_data,
            "extra": extra_data,
            "remaining_hours": remaining
        }

    except Exception as e:
        return {
            "balance": {},
            "extra": [],
            "remaining_hours": 0.0
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()



def get_sessions(student_id):
    sql = text("""
        SELECT Day, TimeID, ScheduleDate, StudentId1 
        FROM dpinkney_TC.dbo.tblSessionSchedule 
        WHERE StudentId1 = :sid
    """)
    with engine.connect() as conn:
        result = conn.execute(sql, {"sid": student_id})
        all_sessions = [dict(row._mapping) for row in result.fetchall()]

    # Current month and year
    today = datetime.now().date()
    current_month = today.month
    current_year = today.year

    recent_sessions = []
    upcoming_sessions = []

    for session in all_sessions:
        try:
            # Add formatted time
            time_id = session.get("TimeID")
            formatted_time = get_time(time_id) if time_id else "Unknown"
            session["Time"] = formatted_time

            # Normalize ScheduleDate
            sched_raw = session.get("ScheduleDate")
            session_date = None

            if isinstance(sched_raw, datetime):
                session_date = sched_raw.date()
            elif isinstance(sched_raw, str):
                try:
                    session_date = parse(sched_raw).date()
                except Exception:
                    continue
            else:
                continue

            # Filter only current month & year
            if session_date.month != current_month or session_date.year != current_year:
                continue

            # Save formatted date and day
            session["FormattedDate"] = session_date.strftime("%Y-%m-%d")
            if not session.get("Day") or session["Day"].strip() == "":
                session["Day"] = session_date.strftime("%A")

            # Categorize
            if session_date < today:
                session["category"] = "recent"
                recent_sessions.append(session)
            else:
                session["category"] = "upcoming"
                upcoming_sessions.append(session)

        except Exception as e:
            session["category"] = "upcoming"
            upcoming_sessions.append(session)

    # Combine and return
    return recent_sessions + upcoming_sessions



# --- API Endpoints ---

@api.route('/api/search_student', methods=['GET'])
def search_student():
    """
    Search all students associated with a parent's contact phone number.
    """
    contact_num = request.args.get('contact_num')

    if not contact_num:
        return jsonify({"error": "Missing contact_num"}), 400

    # Step 1: Lookup parent/inquiry info using contact number
    inquiry = find_inquiry_by_contact_phone(contact_num)
    if not inquiry:
        return jsonify({"error": "Parent not found"}), 404

    inquiry_id = inquiry["ID"]

    # Step 2: Get all students tied to this parent (InquiryID)
    sql = text("""
        SELECT ID, FirstName, LastName 
        FROM tblstudents 
        WHERE InquiryID = :inqID
    """)
    with engine.connect() as conn:
        result = conn.execute(sql, {"inqID": inquiry_id})
        students = [dict(row._mapping) for row in result.fetchall()]

    if not students:
        return jsonify({"error": "No students found for this parent"}), 404

    # Step 3: Get parent balance info
    parent_info = get_hours_balance(inquiry_id)
    parent_data = dict(parent_info) if parent_info else {}

    # Step 4: Attach session data for each student
    for student in students:
        student_id = student["ID"]
        student["sessions"] = get_sessions(student_id)

    return jsonify({
        "success": True,
        "inquiry_id": inquiry_id,
        "parent": parent_data,
        "students": students
    })



#=========================================

@api.route('/api/get_schedule/<int:student_id>', methods=['GET'])
def get_schedule(student_id):
    sessions = get_sessions(student_id)
    return jsonify(sessions)

@api.route('/api/get_balance/<int:inquiry_id>', methods=['GET'])
def get_balance(inquiry_id):
    parent_info = get_hours_balance(inquiry_id)
    return jsonify(parent_info or {})

@api.route('/api/schedule', methods=['GET'])
def get_schedule_data():
    student_id = request.args.get('student_id')

    if not student_id:
        return jsonify({"error": "Missing student_id"}), 400

    try:
        sessions = get_sessions(int(student_id))
        return jsonify({
            "sessions": sessions,
            "student_id": student_id,
            "upcoming_sessions": sessions,  # You could filter here if needed
            "session_timeline": sessions    # Could sort if needed
        })
    except Exception as e:
        return jsonify({"error": f"Failed to fetch sessions: {str(e)}"}), 500

@api.route('/api/student-sessions/<int:student_id>', methods=['GET'])
def get_student_sessions(student_id):
    try:
        sessions = get_sessions(student_id)
        return jsonify({
            "all_sessions": sessions,
            "upcoming_sessions": sessions,  # Optional: filter for future dates
            "session_timeline": sessions    # Optional: sort by time
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route('/api/schedule-change-request', methods=['POST'])
def api_schedule_change_request():
    data = request.get_json()
    
    # Here you would typically save this to a database
    # For now, just return success
    return jsonify({
        "success": True,
        "message": f"Schedule change request submitted for {data.get('student_name')}"
    })
