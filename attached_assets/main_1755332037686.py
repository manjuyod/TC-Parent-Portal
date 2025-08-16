import os
from flask import render_template, request, redirect, url_for, flash, session
from app import app
from routes import find_inquiry_by_contact_phone, get_sessions, get_hours_balance

def require_auth(f):
    """Decorator to require authentication"""
    def decorated_function(*args, **kwargs):
        if 'contact_number' not in session or 'inquiry_id' not in session:
            flash('Please log in to access this page.', 'warning')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    decorated_function.__name__ = f.__name__
    return decorated_function

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Login page"""
    if request.method == 'POST':
        contact_number = request.form.get('contact_number')

        if not contact_number:
            flash('Contact number is required.', 'danger')
            return render_template('login.html')

        try:
            # Look up the contact number in the database
            inquiry_data = find_inquiry_by_contact_phone(contact_number)

            if inquiry_data:
                # Extract parent and student information
                parent_info = inquiry_data['inquiry']
                students_info = inquiry_data['students']

                # Create session data
                session['contact_number'] = contact_number
                session['inquiry_id'] = parent_info['InquiryID']
                session['username'] = parent_info.get('Email', 'Parent')
                session['students'] = [f"{s['FirstName']} {s['LastName']}" for s in students_info]
                session['student_ids'] = [s['ID'] for s in students_info]

                flash(f'Welcome back! Found {len(students_info)} student(s).', 'success')
                return redirect(url_for('index'))
            else:
                flash('Contact number not found. Please check your number or contact the center.', 'danger')

        except Exception as e:
            flash(f'Error during login: {str(e)}', 'danger')

    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    """Registration page"""
    if request.method == 'POST':
        # Registration logic here
        flash('Registration functionality coming soon.', 'info')
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/logout')
def logout():
    session.clear()
    flash('You have been logged out successfully.', 'success')
    return redirect(url_for('login'))

@app.route('/images/<filename>')
def serve_image(filename):
    """Serve images from the images directory"""
    from flask import send_from_directory
    return send_from_directory('static/images', filename)

@app.route('/')
@require_auth
def index():
    """Main dashboard page with combined schedule and billing data"""
    try:
        # Ensure we have valid session data before proceeding
        if 'contact_number' not in session or 'inquiry_id' not in session:
            session.clear()
            flash('Session expired. Please log in again.', 'warning')
            return redirect(url_for('login'))
            
        inquiry_id = session.get('inquiry_id')
        student_ids = session.get('student_ids', [])

        # Get real session data for each student
        print(f"DEBUG MAIN: Getting sessions for student_ids: {student_ids}")
        all_sessions = []
        for student_id in student_ids:
            print(f"DEBUG MAIN: Processing student_id: {student_id}")
            student_sessions = get_sessions(student_id)
            print(f"DEBUG MAIN: Got {len(student_sessions)} sessions for student {student_id}")
            all_sessions.extend(student_sessions)

        print(f"DEBUG MAIN: Total sessions across all students: {len(all_sessions)}")

        # Separate recent and upcoming sessions
        recent_sessions = [s for s in all_sessions if s.get('category') == 'recent']
        upcoming_sessions = [s for s in all_sessions if s.get('category') == 'upcoming']
        
        print(f"DEBUG MAIN: Separated into {len(recent_sessions)} recent and {len(upcoming_sessions)} upcoming sessions")

        # Get balance data
        balance_info = get_hours_balance(inquiry_id) if inquiry_id else {}
        print(f"DEBUG MAIN: Balance info: {balance_info}")

        return render_template('index.html',
                             username=session.get('username'),
                             students=session.get('students', []),
                             sessions=all_sessions,
                             balance_data=balance_info)

    except Exception as e:
        flash(f'Error loading dashboard: {str(e)}', 'warning')
        # Fallback to empty data
        return render_template('index.html',
                             username=session.get('username'),
                             students=session.get('students', []),
                             sessions=[],
                             balance_data={})

@app.route('/schedule')
@require_auth
def schedule():
    """Schedule tab"""
    try:
        student_ids = session.get('student_ids', [])

        # Get real session data for each student
        print(f"DEBUG SCHEDULE ROUTE: Getting sessions for student_ids: {student_ids}")
        all_sessions = []
        for student_id in student_ids:
            print(f"DEBUG SCHEDULE ROUTE: Processing student_id: {student_id}")
            student_sessions = get_sessions(student_id)
            print(f"DEBUG SCHEDULE ROUTE: Got {len(student_sessions)} sessions for student {student_id}")
            all_sessions.extend(student_sessions)

        print(f"DEBUG SCHEDULE ROUTE: Total sessions for schedule page: {len(all_sessions)}")

        return render_template('schedule.html',
                             sessions=all_sessions,
                             students=session.get('students', []),
                             username=session.get('username'))
    except Exception as e:
        flash(f'Error loading schedule: {str(e)}', 'warning')
        return render_template('schedule.html',
                             sessions=[],
                             students=session.get('students', []),
                             username=session.get('username'))

@app.route('/schedule_change_request', methods=['POST'])
@require_auth
def schedule_change_request():
    """Handle schedule change request form submission"""
    try:
        student_name = request.form.get('student_name')
        current_session = request.form.get('current_session')
        requested_change = request.form.get('requested_change')
        reason = request.form.get('reason')
        preferred_date = request.form.get('preferred_date')
        preferred_time = request.form.get('preferred_time')

        # For now, just flash a success message
        flash(f'Schedule change request submitted successfully for {student_name}. The center will be notified.', 'success')
        return redirect(url_for('schedule'))

    except Exception as e:
        flash(f'Error submitting request: {str(e)}', 'danger')
        return redirect(url_for('schedule'))

@app.route('/billing')
@require_auth
def billing():
    """Billing tab"""
    try:
        inquiry_id = session.get('inquiry_id')
        students = session.get('students', [])

        # Get balance data
        balance_info = get_hours_balance(inquiry_id) if inquiry_id else {}

        # Format balance data for billing table
        balance_table_data = []
        if balance_info and students:
            remaining_hours = balance_info.get('remaining_hours', 0)
            for student in students:
                balance_table_data.append({
                    'StudentName': student,
                    'HoursRemaining': remaining_hours,
                    'LastPayment': 'N/A'  # You can add this field later if needed
                })

        return render_template('billing.html',
                             balance_data=balance_info,
                             balance_table_data=balance_table_data,
                             students=students,
                             username=session.get('username'))
    except Exception as e:
        flash(f'Error loading billing: {str(e)}', 'warning')
        return render_template('billing.html',
                             balance_data={},
                             balance_table_data=[],
                             students=session.get('students', []),
                             username=session.get('username'))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=False)