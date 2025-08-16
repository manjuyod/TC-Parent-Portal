
// This script will render React components for navigation
window.renderReactNavigation = function(currentPage, username, students) {
  // Check if React components are available
  if (window.ReactNavigation && window.ReactHeader) {
    // Render Header
    const headerContainer = document.getElementById('react-header');
    if (headerContainer) {
      ReactDOM.render(
        React.createElement(window.ReactHeader, { username, students }),
        headerContainer
      );
    }

    // Render Navigation
    const navContainer = document.getElementById('react-navigation');
    if (navContainer) {
      ReactDOM.render(
        React.createElement(window.ReactNavigation, { currentPage }),
        navContainer
      );
    }
  }
};
